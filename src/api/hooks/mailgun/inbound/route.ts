import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import type { IFileModuleService, ILockingModule } from '@medusajs/framework/types'
import { createHash } from 'node:crypto'
import { Modules } from '@medusajs/framework/utils'
import { resolveTicketService } from '../../../shared/helpers'
import { handleFileUpload } from '../../../shared/upload'
import { InboundEmailError, normalizeInboundEmail, verifyInboundSignature } from './payload'

type CacheService = {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttl: number): Promise<void>
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const uploaded: string[] = []
  let persistenceStarted = false
  try {
    const body = req.body as Record<string, unknown>
    const service = resolveTicketService(req)
    const config = service.getConfig()
    const providerTokenHash = verifyInboundSignature(body, config)
    const { input, payloadHash, automatic } = normalizeInboundEmail(
      body,
      (req.files ?? []) as Express.Multer.File[],
      config,
    )
    const locking = req.scope.resolve<ILockingModule>(Modules.LOCKING)
    const cache = req.scope.resolve<CacheService>(Modules.CACHE)
    const key = createHash('sha256')
      .update(input.recipientEmail + '\0' + input.messageId)
      .digest('hex')
    const result = await locking.execute(
      `support-inbound-token:${providerTokenHash}`,
      async () => {
        // Bind every signed retry nonce, including retries of an already-stored message.
        // Mailgun signs timestamp+token rather than the body; a changed replay must fail.
        const nonceKey = `support-inbound-token:${providerTokenHash}`
        const previous = await cache.get(nonceKey)
        if (previous && previous !== payloadHash)
          throw new InboundEmailError(401, 'inbound_token_replay_mismatch')
        if (!previous) await cache.set(nonceKey, payloadHash, 9 * 60 * 60)
        if (automatic) return 'ignored' as const
        return locking.execute(
          `support-inbound:${key}`,
          async () => {
            const tokenReceipt = await service.lookupInboundEmailByTokenHash(providerTokenHash)
            if (
              tokenReceipt &&
              (tokenReceipt.recipientEmail !== input.recipientEmail ||
                tokenReceipt.providerMessageId !== input.messageId ||
                tokenReceipt.payloadHash !== payloadHash)
            ) {
              throw new InboundEmailError(401, 'inbound_token_replay_mismatch')
            }
            const receipt = await service.lookupInboundEmailReceipt(
              input.recipientEmail,
              input.messageId,
            )
            if (receipt) {
              if (receipt.payloadHash !== payloadHash)
                throw new InboundEmailError(409, 'inbound_message_replay_mismatch')
              return true
            }
            if (input.replyToken) {
              const [token] = await service.listEmailReplyTokens(
                {
                  token_hash: createHash('sha256').update(input.replyToken).digest('hex'),
                  expected_sender_email: input.senderEmail,
                  revoked_at: null,
                },
                { take: 1 },
              )
              if (!token) throw new InboundEmailError(406, 'unrecognized_reply_address_or_sender')
            }
            if ((req.files as Express.Multer.File[]).length) {
              const attachments = await handleFileUpload(req)
              uploaded.push(...attachments.map((file) => file.id))
              input.attachments = attachments.map((file) => ({
                id: file.id,
                filename: file.filename,
                contentType: file.mimeType,
                size: file.size,
              }))
            }
            persistenceStarted = true
            const saved = await service.receiveInboundEmail({
              ...input,
              providerTokenHash,
              payloadHash,
            })
            if (saved.duplicate && uploaded.length) {
              await req.scope.resolve<IFileModuleService>(Modules.FILE).deleteFiles(uploaded)
              uploaded.length = 0
            }
            return saved.duplicate
          },
          { timeout: 60, expire: 120 },
        )
      },
      { timeout: 60, expire: 120 },
    )
    // A public provider ACK must not reveal ticket IDs, sender data or reply tokens.
    return res.status(200).json({
      accepted: true,
      ...(result === 'ignored' ? { ignored: 'automated_message' } : { duplicate: result }),
    })
  } catch (error) {
    if (uploaded.length && !persistenceStarted) {
      try {
        await req.scope.resolve<IFileModuleService>(Modules.FILE).deleteFiles(uploaded)
      } catch {
        req.scope
          .resolve('logger')
          .error('[Support Email] Private upload cleanup requires reconciliation')
      }
    }
    if (uploaded.length && persistenceStarted) {
      // A lost database commit acknowledgement must not delete a ticket's files.
      req.scope
        .resolve('logger')
        .error(
          '[Support Email] Persisted private uploads require receipt reconciliation before cleanup',
        )
    }
    if (error instanceof InboundEmailError)
      return res.status(error.status).json({ message: error.code })
    req.scope
      .resolve('logger')
      .error('[Support Email] Inbound ingestion failed; provider should retry')
    return res.status(503).json({ message: 'Support email ingestion could not complete' })
  }
}
