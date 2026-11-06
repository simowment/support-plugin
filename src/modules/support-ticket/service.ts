import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { ContainerRegistrationKeys, MedusaService, Modules } from '@medusajs/framework/utils'
import type { Logger } from '@medusajs/framework/types'
import { Ticket } from './models/ticket'
import { TicketMessage } from './models/ticket-message'
import { TicketEvent } from './models/ticket-event'
import { TicketNote } from './models/ticket-note'
import { InboundEmailReceipt } from './models/inbound-email-receipt'
import { EmailReplyToken } from './models/email-reply-token'
import { OutboundEmailDraft } from './models/outbound-email-draft'
import { buildTicketAttachmentUrl } from '../../api/shared/attachments'
import {
  resolveSupportTicketConfig,
  type ResolvedSupportTicketConfig,
  type SupportTicketModuleOptions,
} from '../../lib/config'
import {
  TicketStatus,
  TicketEventType,
  TicketEventName,
  TicketCategory,
  type TicketCategory as TicketCategoryType,
  type SenderType,
  SenderType as SenderTypeValues,
} from './constants'

type TicketRecord = {
  id: string
  subject: string
  category: string
  status: string
  customer_id: string | null
  contact_email: string | null
  contact_name: string | null
  assigned_to: string | null
  order_id: string | null
  closed_at: Date | null
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
}

type CreateTicketInput = {
  subject: string
  category: TicketCategoryType
  customerId: string
  orderId?: string
  message: string
  metadata?: Record<string, unknown>
}

type AddMessageInput = {
  ticketId: string
  message: string
  senderType: SenderType
  senderId?: string
  attachments?: unknown[]
}

type UpdateTicketInput = {
  status?: TicketStatus
  assignedTo?: string | null
}

type PaginationParams = {
  take?: number
  skip?: number
}

type ListAdminTicketsInput = {
  status?: string
  category?: string
  customer_id?: string
  assigned_to?: string
  q?: string
  tab?: 'active' | 'closed'
}

export type InboundEmailAttachment = {
  id: string
  filename: string
  contentType: string
  size: number
}

export type ReceiveInboundEmailInput = {
  recipientEmail: string
  senderEmail: string
  senderName?: string
  messageId: string
  subject?: string
  text: string
  attachments?: InboundEmailAttachment[]
  /** Present only when the recipient encodes a server-issued ticket reply token. */
  replyToken?: string
  /** SHA-256 hash of the authenticated provider nonce/token; never pass the raw value. */
  providerTokenHash?: string
  /** SHA-256 hash of canonical body and attachment content supplied by the adapter. */
  payloadHash?: string
}

export type ReceiveInboundEmailResult = {
  duplicate: boolean
  ticketId: string
  messageId: string
  /** Return once to the trusted adapter for use in a reply address; never persist or log it. */
  replyToken?: string
}

type KnexConnection = {
  transaction<T>(callback: (trx: KnexTransaction) => Promise<T>): Promise<T>
  raw(sql: string, bindings?: unknown[]): Promise<{ rows?: Array<Record<string, unknown>> }>
}

type KnexTransaction = {
  raw(sql: string, bindings?: unknown[]): Promise<{ rows?: Array<Record<string, unknown>> }>
}

type InboundEmailReceiptLookup = {
  ticketId: string
  messageId: string
  recipientEmail: string
  providerMessageId: string
  payloadHash: string | null
  providerTokenHash: string | null
}

const UNREAD_REPLY_TICKET_LIMIT = 1000
const UNREAD_REPLY_EVENT_LIMIT = 5000

type TicketEventData = {
  ticket: string
  event_type: string
  data: Record<string, unknown> | null
  performed_by_type: string | null
  performed_by_id: string | null
}

type EventBusService = {
  emit(input: { name: string; data: Record<string, unknown> }): Promise<void>
}

function escapeEmailHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  )
}

function isEventBusService(value: unknown): value is EventBusService {
  return (
    typeof value === 'object' &&
    value !== null &&
    'emit' in value &&
    typeof (value as { emit?: unknown }).emit === 'function'
  )
}

export default class SupportTicketModuleService extends MedusaService({
  Ticket,
  TicketMessage,
  TicketEvent,
  TicketNote,
  InboundEmailReceipt,
  EmailReplyToken,
  OutboundEmailDraft,
}) {
  protected eventBusService_: EventBusService | undefined
  private logger_: Logger
  private container_: Record<string, unknown> & { resolve?: (key: string) => unknown }

  private config_: ResolvedSupportTicketConfig

  constructor(
    container: Record<string, unknown> & { logger?: Logger },
    options?: SupportTicketModuleOptions,
  ) {
    super(...arguments)
    this.container_ = container as Record<string, unknown> & { resolve?: (key: string) => unknown }
    const eventBusService = container[Modules.EVENT_BUS]
    this.eventBusService_ = isEventBusService(eventBusService) ? eventBusService : undefined
    this.logger_ = container.logger ?? (console as unknown as Logger)
    this.config_ = resolveSupportTicketConfig(options ?? {})
  }

  /** Resolved module configuration (options with environment fallbacks). */
  getConfig(): ResolvedSupportTicketConfig {
    return this.config_
  }

  private getPgConnection(): KnexConnection {
    const connection =
      this.container_[ContainerRegistrationKeys.PG_CONNECTION] ??
      this.container_.resolve?.(ContainerRegistrationKeys.PG_CONNECTION)
    if (!connection || typeof (connection as KnexConnection).transaction !== 'function') {
      throw new Error('Support ticket inbound email requires the Medusa PostgreSQL connection')
    }
    return connection as KnexConnection
  }

  private newId(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '')}`
  }

  private normalizeEmail(value: string, preserveReplyToken = false): string {
    const trimmed = value.trim()
    const at = trimmed.lastIndexOf('@')
    const email =
      preserveReplyToken && trimmed.startsWith('reply+')
        ? trimmed.slice(0, at) + trimmed.slice(at).toLowerCase()
        : trimmed.toLowerCase()
    if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Inbound support email address is invalid')
    }
    return email
  }

  private normalizeProviderMessageId(value: string): string {
    const messageId = value.trim()
    if (!messageId || messageId.length > 998) {
      throw new Error('Inbound support email requires a valid Message-ID')
    }
    return messageId
  }

  private normalizeSha256Hash(value: string): string {
    const hash = value.trim().toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error('Inbound email integrity hashes must be 64-character SHA-256 hex strings')
    }
    return hash
  }

  private hashReplyToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  private normalizeAttachmentDescriptors(input?: InboundEmailAttachment[]) {
    const descriptors = input ?? []
    if (descriptors.length > 5) {
      throw new Error('Inbound support email exceeds the five-attachment limit')
    }
    const totalSize = descriptors.reduce((sum, attachment) => sum + attachment.size, 0)
    if (
      descriptors.some(
        (attachment) =>
          !Number.isSafeInteger(attachment.size) ||
          attachment.size < 0 ||
          attachment.size > 10_485_760,
      ) ||
      totalSize > 26_214_400
    ) {
      throw new Error('Inbound support email attachments exceed the permitted size limits')
    }
    return descriptors.map((attachment) => ({
      id: String(attachment.id).slice(0, 200),
      filename: String(attachment.filename).slice(0, 500),
      contentType: String(attachment.contentType).slice(0, 200),
      size: attachment.size,
    }))
  }

  private ticketAttachmentDescriptors(
    ticketId: string,
    attachments: ReturnType<typeof this.normalizeAttachmentDescriptors>,
  ) {
    return attachments.map((attachment) => ({
      id: attachment.id,
      url: buildTicketAttachmentUrl(ticketId, attachment.id),
      filename: attachment.filename,
      mimeType: attachment.contentType,
      size: attachment.size ?? 0,
    }))
  }

  /**
   * Persist a normalized inbound email as a guest ticket or a sender-verified
   * reply. The caller must authenticate the provider webhook before calling.
   * The database transaction and unique recipient/message-id key make retries
   * idempotent without retaining raw MIME.
   */
  async lookupInboundEmailReceipt(
    recipientEmail: string,
    messageId: string,
  ): Promise<InboundEmailReceiptLookup | null> {
    const normalizedRecipient = this.normalizeEmail(recipientEmail, true)
    const normalizedMessageId = this.normalizeProviderMessageId(messageId)
    const result = await this.getPgConnection().raw(
      `select "recipient_email", "message_id", "ticket_id", "ticket_message_id", "payload_hash", "provider_token_hash" from "ticket_inbound_email_receipt"
       where "recipient_email" = ? and "message_id" = ? limit 1`,
      [normalizedRecipient, normalizedMessageId],
    )
    const row = result.rows?.[0]
    if (!row?.ticket_id || !row.ticket_message_id) return null
    return {
      ticketId: String(row.ticket_id),
      messageId: String(row.ticket_message_id),
      recipientEmail: String(row.recipient_email),
      providerMessageId: String(row.message_id),
      payloadHash: row.payload_hash == null ? null : String(row.payload_hash),
      providerTokenHash: row.provider_token_hash == null ? null : String(row.provider_token_hash),
    }
  }

  async lookupInboundEmailByTokenHash(
    providerTokenHash: string,
  ): Promise<InboundEmailReceiptLookup | null> {
    const normalizedHash = this.normalizeSha256Hash(providerTokenHash)
    const result = await this.getPgConnection().raw(
      `select "recipient_email", "message_id", "ticket_id", "ticket_message_id", "payload_hash", "provider_token_hash"
       from "ticket_inbound_email_receipt" where "provider_token_hash" = ? limit 1`,
      [normalizedHash],
    )
    const row = result.rows?.[0]
    if (!row?.ticket_id || !row.ticket_message_id) return null
    return {
      ticketId: String(row.ticket_id),
      messageId: String(row.ticket_message_id),
      recipientEmail: String(row.recipient_email),
      providerMessageId: String(row.message_id),
      payloadHash: row.payload_hash == null ? null : String(row.payload_hash),
      providerTokenHash: row.provider_token_hash == null ? null : String(row.provider_token_hash),
    }
  }

  async lookupInboundEmailReceiptByProviderTokenHash(
    providerTokenHash: string,
  ): Promise<InboundEmailReceiptLookup | null> {
    return this.lookupInboundEmailByTokenHash(providerTokenHash)
  }

  async receiveInboundEmail(input: ReceiveInboundEmailInput): Promise<ReceiveInboundEmailResult> {
    const recipientEmail = this.normalizeEmail(input.recipientEmail, true)
    const senderEmail = this.normalizeEmail(input.senderEmail)
    const providerMessageId = this.normalizeProviderMessageId(input.messageId)
    if ((input.providerTokenHash === undefined) !== (input.payloadHash === undefined)) {
      throw new Error('Inbound email provider token and payload hashes must be supplied together')
    }
    const providerTokenHash =
      input.providerTokenHash === undefined
        ? undefined
        : this.normalizeSha256Hash(input.providerTokenHash)
    const payloadHash =
      input.payloadHash === undefined ? undefined : this.normalizeSha256Hash(input.payloadHash)
    const subject = (input.subject?.trim() || 'Email support request').slice(0, 500)
    const messageText = input.text.trim().slice(0, 100_000)
    const uploadedAttachments = this.normalizeAttachmentDescriptors(input.attachments)
    if (!messageText && uploadedAttachments.length === 0) {
      throw new Error('Inbound support email requires a text body')
    }

    const connection = this.getPgConnection()
    let createdReplyToken: string | undefined
    let eventName: string | undefined
    let eventData: Record<string, unknown> | undefined
    let result: ReceiveInboundEmailResult

    try {
      result = await connection.transaction(async (trx) => {
        if (providerTokenHash && payloadHash) {
          const tokenReceipt = await trx.raw(
            `select "recipient_email", "message_id", "ticket_id", "ticket_message_id", "payload_hash", "provider_token_hash"
             from "ticket_inbound_email_receipt" where "provider_token_hash" = ? limit 1`,
            [providerTokenHash],
          )
          const tokenRow = tokenReceipt.rows?.[0]
          if (tokenRow) {
            if (
              tokenRow.recipient_email !== recipientEmail ||
              tokenRow.message_id !== providerMessageId ||
              tokenRow.payload_hash !== payloadHash
            ) {
              throw new Error(
                'Inbound email provider token was replayed with different content or identity',
              )
            }
            if (tokenRow.ticket_id && tokenRow.ticket_message_id) {
              return {
                duplicate: true,
                ticketId: String(tokenRow.ticket_id),
                messageId: String(tokenRow.ticket_message_id),
              }
            }
          }
        }

        const existing = await trx.raw(
          `select "ticket_id", "ticket_message_id", "payload_hash" from "ticket_inbound_email_receipt"
           where "recipient_email" = ? and "message_id" = ? limit 1`,
          [recipientEmail, providerMessageId],
        )
        const existingRow = existing.rows?.[0]
        if (existingRow?.ticket_id && existingRow?.ticket_message_id) {
          if (payloadHash && existingRow.payload_hash !== payloadHash) {
            throw new Error('Inbound email Message-ID was replayed with different content')
          }
          return {
            duplicate: true,
            ticketId: String(existingRow.ticket_id),
            messageId: String(existingRow.ticket_message_id),
          }
        }

        const now = new Date()
        let ticketId: string
        let ticketMessageId: string
        let ticketWasCreated = false

        if (input.replyToken) {
          const tokenHash = this.hashReplyToken(input.replyToken)
          const tokenResult = await trx.raw(
            `select "ticket_id" from "ticket_email_reply_token"
             where "token_hash" = ? and "expected_sender_email" = ?
               and "revoked_at" is null and "deleted_at" is null limit 1`,
            [tokenHash, senderEmail],
          )
          const tokenRow = tokenResult.rows?.[0]
          if (!tokenRow?.ticket_id) {
            throw new Error('Inbound email reply token or expected sender did not match')
          }
          ticketId = String(tokenRow.ticket_id)
          ticketMessageId = this.newId('tme')
          const ticketAttachments = this.ticketAttachmentDescriptors(ticketId, uploadedAttachments)
          await trx.raw(
            `insert into "ticket_message" ("id", "ticket_id", "sender_type", "sender_id", "message", "attachments", "created_at", "updated_at")
             values (?, ?, ?, null, ?, ?::jsonb, ?, ?)`,
            [
              ticketMessageId,
              ticketId,
              SenderTypeValues.CUSTOMER,
              messageText,
              JSON.stringify(ticketAttachments.length ? { items: ticketAttachments } : null),
              now,
              now,
            ],
          )
          await trx.raw(
            `update "ticket" set "status" = ?, "closed_at" = null, "updated_at" = ? where "id" = ?`,
            [TicketStatus.OPEN, now, ticketId],
          )
          const eventId = this.newId('tev')
          await trx.raw(
            `insert into "ticket_event" ("id", "ticket_id", "event_type", "data", "performed_by_type", "performed_by_id", "created_at", "updated_at")
             values (?, ?, ?, ?::jsonb, ?, null, ?, ?)`,
            [
              eventId,
              ticketId,
              TicketEventType.MESSAGE_ADDED,
              JSON.stringify({ sender_type: SenderTypeValues.CUSTOMER, channel: 'email' }),
              SenderTypeValues.CUSTOMER,
              now,
              now,
            ],
          )
          eventName = TicketEventName.CUSTOMER_REPLY
          eventData = { id: ticketId, message_id: ticketMessageId, channel: 'email' }
        } else {
          ticketId = this.newId('tic')
          ticketMessageId = this.newId('tme')
          const ticketAttachments = this.ticketAttachmentDescriptors(ticketId, uploadedAttachments)
          const displayName = input.senderName?.trim().slice(0, 200) || null
          await trx.raw(
            `insert into "ticket" ("id", "subject", "category", "status", "customer_id", "contact_email", "contact_name", "order_id", "metadata", "created_at", "updated_at")
             values (?, ?, ?, ?, null, ?, ?, null, null, ?, ?)`,
            [
              ticketId,
              subject,
              TicketCategory.GENERAL,
              TicketStatus.OPEN,
              senderEmail,
              displayName,
              now,
              now,
            ],
          )
          await trx.raw(
            `insert into "ticket_message" ("id", "ticket_id", "sender_type", "sender_id", "message", "attachments", "created_at", "updated_at")
             values (?, ?, ?, null, ?, ?::jsonb, ?, ?)`,
            [
              ticketMessageId,
              ticketId,
              SenderTypeValues.CUSTOMER,
              messageText,
              JSON.stringify(ticketAttachments.length ? { items: ticketAttachments } : null),
              now,
              now,
            ],
          )
          const eventId = this.newId('tev')
          await trx.raw(
            `insert into "ticket_event" ("id", "ticket_id", "event_type", "data", "performed_by_type", "performed_by_id", "created_at", "updated_at")
             values (?, ?, ?, ?::jsonb, ?, null, ?, ?)`,
            [
              eventId,
              ticketId,
              TicketEventType.TICKET_CREATED,
              JSON.stringify({ category: TicketCategory.GENERAL, channel: 'email' }),
              SenderTypeValues.CUSTOMER,
              now,
              now,
            ],
          )

          createdReplyToken = randomBytes(32).toString('base64url')
          await trx.raw(
            `insert into "ticket_email_reply_token" ("id", "token_hash", "expected_sender_email", "ticket_id", "created_at", "updated_at")
             values (?, ?, ?, ?, ?, ?)`,
            [
              this.newId('ter'),
              this.hashReplyToken(createdReplyToken),
              senderEmail,
              ticketId,
              now,
              now,
            ],
          )
          ticketWasCreated = true
          eventName = TicketEventName.CREATED
          eventData = { id: ticketId, subject, category: TicketCategory.GENERAL, channel: 'email' }
        }

        await trx.raw(
          `insert into "ticket_inbound_email_receipt" ("id", "recipient_email", "message_id", "sender_email", "provider_token_hash", "payload_hash", "ticket_id", "ticket_message_id", "created_at", "updated_at")
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            this.newId('ier'),
            recipientEmail,
            providerMessageId,
            senderEmail,
            providerTokenHash ?? null,
            payloadHash ?? null,
            ticketId,
            ticketMessageId,
            now,
            now,
          ],
        )

        return {
          duplicate: false,
          ticketId,
          messageId: ticketMessageId,
          ...(ticketWasCreated && createdReplyToken ? { replyToken: createdReplyToken } : {}),
        }
      })
    } catch (error) {
      // A concurrent duplicate may win the unique insert. Its transaction has
      // already committed the ticket and message, so resolve to that receipt.
      const code = (error as { code?: string })?.code
      if (code !== '23505') throw error
      eventName = undefined
      eventData = undefined
      createdReplyToken = undefined
      let row: Record<string, unknown> | undefined
      if (providerTokenHash) {
        const duplicateByToken = await connection.raw(
          `select "recipient_email", "message_id", "ticket_id", "ticket_message_id", "payload_hash", "provider_token_hash"
           from "ticket_inbound_email_receipt" where "provider_token_hash" = ? limit 1`,
          [providerTokenHash],
        )
        row = duplicateByToken.rows?.[0]
        if (
          row &&
          (row.recipient_email !== recipientEmail ||
            row.message_id !== providerMessageId ||
            row.payload_hash !== payloadHash)
        ) {
          throw new Error(
            'Inbound email provider token was replayed with different content or identity',
          )
        }
      }
      if (!row) {
        const duplicateByIdentity = await connection.raw(
          `select "ticket_id", "ticket_message_id", "payload_hash" from "ticket_inbound_email_receipt"
           where "recipient_email" = ? and "message_id" = ? limit 1`,
          [recipientEmail, providerMessageId],
        )
        row = duplicateByIdentity.rows?.[0]
        if (row && payloadHash && row.payload_hash !== payloadHash) {
          throw new Error('Inbound email Message-ID was replayed with different content')
        }
      }
      if (!row?.ticket_id || !row.ticket_message_id) throw error
      result = {
        duplicate: true,
        ticketId: String(row.ticket_id),
        messageId: String(row.ticket_message_id),
      }
    }

    if (eventName && this.eventBusService_) {
      try {
        await this.eventBusService_.emit({
          name: eventName,
          data: eventData ?? { id: result.ticketId },
        })
      } catch (error) {
        this.logger_.warn(
          `[Support Tickets] inbound email event emit failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    return result
  }

  /** Issue another one-time-secret reply address for a guest ticket after an owner-reviewed draft. */
  async issueGuestEmailReplyToken(
    ticketId: string,
  ): Promise<{ replyToken: string; expectedSenderEmail: string }> {
    const ticket = await this.getTicketById(ticketId)
    if (!ticket || ticket.customer_id || !ticket.contact_email) {
      throw new Error('Ticket is not an email-contact guest ticket')
    }
    const replyToken = randomBytes(32).toString('base64url')
    const now = new Date()
    await this.getPgConnection().raw(
      `insert into "ticket_email_reply_token" ("id", "token_hash", "expected_sender_email", "ticket_id", "created_at", "updated_at")
       values (?, ?, ?, ?, ?, ?)`,
      [
        this.newId('ter'),
        this.hashReplyToken(replyToken),
        ticket.contact_email,
        ticketId,
        now,
        now,
      ],
    )
    return { replyToken, expectedSenderEmail: ticket.contact_email }
  }

  async saveGuestEmailDraft(
    ticketId: string,
    body: string,
    draftId?: string,
    clientId?: string,
    expectedRevision?: number,
  ) {
    const ticket = await this.getTicketById(ticketId)
    if (!ticket || ticket.customer_id || !ticket.contact_email)
      throw new Error('Guest ticket not found')
    const clean = body.trim()
    if (!clean || clean.length > 10000) throw new Error('Reply body is invalid')
    const now = new Date()
    if (draftId) {
      if (expectedRevision === undefined) throw new Error('Draft revision is required when editing')
      const updated = await this.getPgConnection().raw(
        `update "ticket_outbound_email_draft" set "body" = ?, "revision" = "revision" + 1, "updated_at" = ? where "id" = ? and "ticket_id" = ? and "status" = 'draft' and "revision" = ? and "deleted_at" is null returning "id", "ticket_id", "body", "revision", "status", "subject", "recipient_email", "email_queue_id"`,
        [clean, now, draftId, ticketId, expectedRevision],
      )
      const row = updated.rows?.[0]
      if (!row) throw new Error('Draft not found or already submitted for sending')
      return this.safeDraft(row)
    }
    const id = clientId ?? this.newId('ted')
    if (!/^ted_[a-zA-Z0-9_-]{16,100}$/.test(id)) throw new Error('Draft request ID is invalid')
    const rows = await this.getPgConnection().raw(
      `insert into "ticket_outbound_email_draft" ("id", "ticket_id", "body", "revision", "status", "recipient_email", "subject", "sent_by", "created_at", "updated_at") values (?, ?, ?, 1, 'draft', ?, ?, null, ?, ?) on conflict ("id") do nothing returning "id", "ticket_id", "body", "revision", "status", "subject", "recipient_email", "email_queue_id"`,
      [
        id,
        ticketId,
        clean,
        ticket.contact_email,
        `Re: ${ticket.subject}`.replace(/[\r\n]+/g, ' ').slice(0, 200),
        now,
        now,
      ],
    )
    const row =
      rows.rows?.[0] ??
      (
        await this.getPgConnection().raw(
          `select "id", "ticket_id", "body", "revision", "status", "subject", "recipient_email", "email_queue_id" from "ticket_outbound_email_draft" where "id" = ? and "deleted_at" is null limit 1`,
          [id],
        )
      ).rows?.[0]
    if (!row || row.ticket_id !== ticketId || row.body !== clean)
      throw new Error('Draft request ID was already used for different content')
    return this.safeDraft(row)
  }

  async getGuestEmailDraft(id: string) {
    const result = await this.getPgConnection().raw(
      `select "id", "ticket_id", "body", "revision", "status", "subject", "recipient_email", "email_queue_id", "frozen_payload", "idempotency_key" from "ticket_outbound_email_draft" where "id" = ? and "deleted_at" is null limit 1`,
      [id],
    )
    return result.rows?.[0] ?? null
  }

  async freezeGuestEmailDraft(id: string, expectedRevision: number, actorId: string) {
    const draft = await this.getGuestEmailDraft(id)
    if (!draft) throw new Error('Draft cannot be sent')
    if (Number(draft.revision) !== expectedRevision)
      throw new Error('Draft changed after review; reload it before sending')
    if (draft.frozen_payload) return draft
    if (draft.status !== 'draft') throw new Error('Draft cannot be sent')
    const ticket = await this.getTicketById(String(draft.ticket_id))
    if (
      !ticket ||
      ticket.customer_id ||
      !ticket.contact_email ||
      ticket.contact_email !== draft.recipient_email
    )
      throw new Error('Guest ticket recipient changed')
    const token = await this.issueGuestEmailReplyToken(ticket.id)
    const domain = this.config_.replyEmailDomain
    if (!domain || !/^[a-z0-9.-]+$/.test(domain))
      throw new Error('Support reply email domain is not configured')
    const replyTo = `reply+${token.replyToken}@${domain}`
    const body = String(draft.body)
    const html = `<div style="white-space:pre-wrap;font-family:Arial,sans-serif">${escapeEmailHtml(body)}</div>`
    const payload = {
      to: ticket.contact_email,
      subject: String(draft.subject),
      text: body,
      html,
      reply_to: replyTo,
    }
    const key = `support-ticket-reply:${id}`
    const frozenUpdate = await this.getPgConnection().raw(
      `update "ticket_outbound_email_draft" set "frozen_payload" = ?::jsonb, "idempotency_key" = ?, "status" = 'sending', "sent_by" = ?, "updated_at" = now() where "id" = ? and "revision" = ? and "status" = 'draft' and "frozen_payload" is null and "deleted_at" is null returning "ticket_id"`,
      [JSON.stringify(payload), key, actorId, id, expectedRevision],
    )
    const ticketId = frozenUpdate.rows?.[0]?.ticket_id
    if (ticketId) {
      await this.createTicketEvents([
        this.buildEvent(
          String(ticketId),
          'email_reply_queued',
          { draft_id: id, action: 'human_send_requested' },
          'admin',
          actorId,
        ),
      ])
    }
    const frozen = await this.getGuestEmailDraft(id)
    if (!frozen?.frozen_payload || Number(frozen.revision) !== expectedRevision) {
      throw new Error('Draft changed while send was being prepared; review and retry')
    }
    return frozen
  }

  async markGuestEmailDraftQueued(id: string, queueId: string, status: string) {
    const updated = await this.getPgConnection().raw(
      `update "ticket_outbound_email_draft" set "email_queue_id" = ?, "status" = ?, "updated_at" = now() where "id" = ? and "deleted_at" is null returning "ticket_id"`,
      [queueId, status, id],
    )
    return updated.rows?.[0] ?? null
  }

  async listGuestEmailDrafts(ticketId: string) {
    const result = await this.getPgConnection().raw(
      `select "id", "ticket_id", "body", "revision", "status", "subject", "recipient_email", "email_queue_id" from "ticket_outbound_email_draft" where "ticket_id" = ? and "deleted_at" is null order by "created_at" asc`,
      [ticketId],
    )
    return (result.rows ?? []).map((row) => this.safeDraft(row))
  }

  private safeDraft(row: Record<string, unknown>) {
    return {
      id: row.id,
      ticket_id: row.ticket_id,
      body: row.body,
      revision: row.revision,
      status: row.status,
      subject: row.subject,
      recipient_email: row.recipient_email,
      email_queue_id: row.email_queue_id,
    }
  }

  // ── Private helpers ──────────────────────────────────────────────

  /** Canonical ticket read, shared with workflows. */
  async getTicketById(ticketId: string): Promise<TicketRecord | null> {
    const [ticket] = await this.listTickets({ id: ticketId }, { take: 1 })
    return (ticket as TicketRecord) ?? null
  }

  private buildEvent(
    ticketId: string,
    eventType: string,
    data: Record<string, unknown> | null,
    performedByType?: string | null,
    performedById?: string | null,
  ): TicketEventData {
    return {
      ticket: ticketId,
      event_type: eventType,
      data,
      performed_by_type: performedByType ?? null,
      performed_by_id: performedById ?? null,
    }
  }

  private async emitAndPersistEvents(
    ticketId: string,
    events: TicketEventData[],
    eventName?: string,
    eventBusData?: Record<string, unknown>,
  ): Promise<void> {
    if (events.length > 0) {
      await this.createTicketEvents(events)
    }
    if (eventName && this.eventBusService_) {
      await this.eventBusService_.emit({ name: eventName, data: eventBusData ?? { id: ticketId } })
    }
  }

  private throwAddMessageSideEffect(action: string, error: unknown): never {
    const message = error instanceof Error ? error.message : String(error)
    this.logger_.warn(`[Support Tickets] addMessage ${action} failed: ${message}`)
    throw error
  }

  // ── Ticket CRUD ──────────────────────────────────────────────────

  async createTicket(input: CreateTicketInput): Promise<TicketRecord> {
    const [ticket] = await this.createTickets([
      {
        subject: input.subject,
        category: input.category,
        status: TicketStatus.OPEN,
        customer_id: input.customerId,
        order_id: input.orderId ?? null,
        metadata: input.metadata ?? null,
      },
    ])

    await this.createTicketMessages([
      {
        ticket: ticket.id,
        sender_type: SenderTypeValues.CUSTOMER,
        sender_id: input.customerId,
        message: input.message,
        attachments: null,
      },
    ])

    await this.emitAndPersistEvents(
      ticket.id,
      [
        this.buildEvent(
          ticket.id,
          TicketEventType.TICKET_CREATED,
          { category: input.category },
          SenderTypeValues.CUSTOMER,
          input.customerId,
        ),
      ],
      TicketEventName.CREATED,
      {
        id: ticket.id,
        subject: input.subject,
        category: input.category,
        customer_id: input.customerId,
        order_id: input.orderId ?? null,
        message: input.message,
      },
    )

    return ticket as unknown as TicketRecord
  }

  async addMessage(input: AddMessageInput) {
    const currentTicket = await this.getTicketById(input.ticketId)
    if (!currentTicket) {
      throw new Error(`Ticket ${input.ticketId} not found`)
    }

    const isClosed = currentTicket.status === TicketStatus.CLOSED

    // 1. Create message FIRST (critical data — must persist)
    const [message] = await this.createTicketMessages([
      {
        ticket: input.ticketId,
        sender_type: input.senderType,
        sender_id: input.senderId ?? null,
        message: input.message,
        attachments: input.attachments ? { items: input.attachments } : null,
      },
    ])

    // 2. Reopen ticket if closed (non-critical — guarded)
    if (isClosed) {
      try {
        await this.updateTickets([
          { id: input.ticketId, status: TicketStatus.OPEN, closed_at: null },
        ])
      } catch (error) {
        this.throwAddMessageSideEffect('reopen ticket update', error)
      }
      try {
        await this.createTicketEvents([
          this.buildEvent(
            input.ticketId,
            TicketEventType.TICKET_REOPENED,
            { reason: 'message_received', sender_type: input.senderType },
            input.senderType,
            input.senderId,
          ),
        ])
      } catch (error) {
        this.throwAddMessageSideEffect('reopen event creation', error)
      }
    }

    // 3. Create message event (non-critical — guarded)
    try {
      await this.createTicketEvents([
        this.buildEvent(
          input.ticketId,
          TicketEventType.MESSAGE_ADDED,
          { sender_type: input.senderType },
          input.senderType,
          input.senderId,
        ),
      ])
    } catch (error) {
      this.throwAddMessageSideEffect('message event creation', error)
    }

    // 4. Update status (non-critical — guarded)
    if (input.senderType !== SenderTypeValues.SYSTEM) {
      const effectiveStatus = isClosed ? TicketStatus.OPEN : currentTicket.status
      try {
        if (
          input.senderType === SenderTypeValues.CUSTOMER &&
          effectiveStatus !== TicketStatus.OPEN
        ) {
          await this.updateTickets([{ id: input.ticketId, status: TicketStatus.WAITING_ADMIN }])
        } else if (input.senderType === SenderTypeValues.ADMIN) {
          await this.updateTickets([{ id: input.ticketId, status: TicketStatus.WAITING_CUSTOMER }])
        }
      } catch (error) {
        this.throwAddMessageSideEffect('status update', error)
      }
    }

    // 5. Emit event bus LAST (external side effect, after DB is consistent)
    try {
      await this.eventBusService_?.emit({
        name: TicketEventName.MESSAGE_ADDED,
        data: {
          ticket_id: input.ticketId,
          message_id: (message as { id: string }).id,
          sender_type: input.senderType,
          sender_id: input.senderId ?? null,
          message: input.message,
        },
      })
    } catch (error) {
      this.throwAddMessageSideEffect('event bus emit', error)
    }

    return message
  }

  async updateTicket(
    ticketId: string,
    input: UpdateTicketInput,
    performedByType?: string,
    performedById?: string,
  ) {
    const currentTicket = await this.getTicketById(ticketId)
    if (!currentTicket) {
      return null
    }

    const updates: Record<string, unknown> = { id: ticketId }
    const events: TicketEventData[] = []

    if (input.status !== undefined) {
      const oldStatus = currentTicket.status
      updates.status = input.status
      const wasClosed = oldStatus === TicketStatus.CLOSED
      const isNowClosed = input.status === TicketStatus.CLOSED

      if (wasClosed && !isNowClosed) {
        updates.closed_at = null
      }

      if (isNowClosed) {
        updates.closed_at = new Date()
        events.push(
          this.buildEvent(
            ticketId,
            TicketEventType.TICKET_CLOSED,
            { old_status: oldStatus },
            performedByType,
            performedById,
          ),
        )
      } else if (wasClosed) {
        events.push(
          this.buildEvent(
            ticketId,
            TicketEventType.TICKET_REOPENED,
            { old_status: oldStatus, new_status: input.status },
            performedByType,
            performedById,
          ),
        )
      } else {
        events.push(
          this.buildEvent(
            ticketId,
            TicketEventType.STATUS_CHANGED,
            { old_status: oldStatus, new_status: input.status },
            performedByType,
            performedById,
          ),
        )
      }
    }

    if (input.assignedTo !== undefined && input.assignedTo !== currentTicket.assigned_to) {
      updates.assigned_to = input.assignedTo
      events.push(
        this.buildEvent(
          ticketId,
          input.assignedTo ? TicketEventType.ASSIGNED : TicketEventType.UNASSIGNED,
          { old_assigned_to: currentTicket.assigned_to, new_assigned_to: input.assignedTo },
          performedByType,
          performedById,
        ),
      )
    }

    const [updated] = await this.updateTickets([updates])
    await this.emitAndPersistEvents(ticketId, events, TicketEventName.UPDATED, {
      id: ticketId,
      ...input,
    })
    return updated
  }

  async deleteTicket(ticketId: string, performedByType?: string, performedById?: string) {
    const ticket = await this.getTicketById(ticketId)
    if (!ticket) {
      return null
    }

    await Promise.all([
      this.deleteTicketMessages({ ticket: ticketId }),
      this.deleteTicketNotes({ ticket: ticketId }),
      this.deleteTicketEvents({ ticket: ticketId }),
    ])
    await this.deleteTickets({ id: ticketId })

    await this.eventBusService_?.emit({
      name: TicketEventName.DELETED,
      data: {
        id: ticketId,
        performed_by_type: performedByType ?? null,
        performed_by_id: performedById ?? null,
      },
    })

    return { id: ticketId }
  }

  async listCustomerTickets(
    customerId: string,
    filters?: { status?: string },
    pagination?: PaginationParams,
  ) {
    const queryFilters: Record<string, unknown> = { customer_id: customerId }
    if (filters?.status) queryFilters.status = filters.status

    return this.listTickets(queryFilters, {
      order: { created_at: 'DESC' },
      take: pagination?.take ?? 50,
      skip: pagination?.skip ?? 0,
    })
  }

  async listAdminTickets(input: ListAdminTicketsInput, pagination?: PaginationParams) {
    const filters: Record<string, unknown> = {}

    if (input.status) {
      filters.status = input.status
    } else if (input.tab === 'closed') {
      filters.status = TicketStatus.CLOSED
    } else if (input.tab === 'active') {
      filters.status = { $ne: TicketStatus.CLOSED }
    }

    if (input.category) filters.category = input.category
    if (input.customer_id) filters.customer_id = input.customer_id
    if (input.assigned_to) filters.assigned_to = input.assigned_to

    const search = input.q?.trim()
    if (search) {
      const likeSearch = `%${search.replace(/[%_\\]/g, '\\$&')}%`
      filters.$or = [
        { id: { $ilike: likeSearch } },
        { subject: { $ilike: likeSearch } },
        { customer_id: { $ilike: likeSearch } },
        { contact_email: { $ilike: likeSearch } },
        { contact_name: { $ilike: likeSearch } },
        { order_id: { $ilike: likeSearch } },
      ]
    }

    const [tickets, count] = await this.listAndCountTickets(filters, {
      order: { created_at: 'DESC' },
      take: pagination?.take ?? 50,
      skip: pagination?.skip ?? 0,
    })

    return { tickets, count }
  }

  async getTicketWithMessages(ticketId: string) {
    const ticket = await this.getTicketById(ticketId)
    if (!ticket) return null

    const [messages, events, notes] = await Promise.all([
      this.listTicketMessages({ ticket: ticketId }, { order: { created_at: 'ASC' } }),
      this.listTicketEvents({ ticket: ticketId }, { order: { created_at: 'ASC' } }),
      this.listTicketNotes({ ticket: ticketId }, { order: { created_at: 'ASC' } }),
    ])

    return { ticket, messages, events, notes }
  }

  // ── Ticket merging ────────────────────────────────────────────────

  async mergeTickets(
    sourceTicketId: string,
    targetTicketId: string,
    performedByType?: string,
    performedById?: string,
  ) {
    if (sourceTicketId === targetTicketId) {
      throw new Error('Cannot merge a ticket with itself.')
    }

    const [source, target] = await Promise.all([
      this.getTicketById(sourceTicketId),
      this.getTicketById(targetTicketId),
    ])

    if (!source || !target) {
      throw new Error(`Both tickets must exist. Got source=${!source}, target=${!target}`)
    }

    if (!source.customer_id || source.customer_id !== target.customer_id) {
      throw new Error('Tickets can only be merged when they belong to the same customer.')
    }

    // Move messages from source to target. Write the foreign key directly:
    // `ticket` is a relation, and an update payload carrying the relation is
    // accepted and then dropped, leaving the row on the source ticket.
    const messages = await this.listTicketMessages({ ticket: sourceTicketId }, { take: 1000 })
    await this.updateTicketMessages(
      messages.map((message) => ({ id: message.id, ticket_id: targetTicketId })),
    )

    // Move notes from source to target
    const notes = await this.listTicketNotes({ ticket: sourceTicketId }, { take: 1000 })
    await this.updateTicketNotes(notes.map((note) => ({ id: note.id, ticket_id: targetTicketId })))

    // Mark source closed and record merge in metadata
    await this.updateTickets([
      {
        id: sourceTicketId,
        status: TicketStatus.CLOSED,
        closed_at: new Date(),
        metadata: {
          ...((source.metadata as Record<string, unknown>) ?? {}),
          merged_into: targetTicketId,
        },
      },
    ])

    // Update target subject if needed (prepend note)
    await this.updateTickets([
      {
        id: targetTicketId,
        metadata: {
          ...((target.metadata as Record<string, unknown>) ?? {}),
          merged_from: sourceTicketId,
        },
      },
    ])

    const events: TicketEventData[] = [
      this.buildEvent(
        targetTicketId,
        TicketEventType.TICKET_MERGED,
        {
          source_ticket_id: sourceTicketId,
          source_subject: source.subject,
          messages_moved: messages.length,
          notes_moved: notes.length,
        },
        performedByType,
        performedById,
      ),
      this.buildEvent(
        sourceTicketId,
        TicketEventType.TICKET_MERGED,
        {
          merged_into: targetTicketId,
        },
        performedByType,
        performedById,
      ),
    ]

    await this.emitAndPersistEvents(targetTicketId, events, TicketEventName.MERGED, {
      source_ticket_id: sourceTicketId,
      target_ticket_id: targetTicketId,
    })

    return { source_ticket_id: sourceTicketId, target_ticket_id: targetTicketId }
  }

  // ── Notes ────────────────────────────────────────────────────────

  async addNote(ticketId: string, content: string, authorId?: string) {
    const [note] = await this.createTicketNotes([
      {
        ticket: ticketId,
        content,
        author_id: authorId ?? null,
      },
    ])
    return note
  }

  // ── Customer reply notifications ────────────────────────────────

  /**
   * Count tickets where the most recent message is from a customer.
   * These represent tickets needing admin attention.
   */
  async getUnreadCustomerReplyCount(): Promise<number> {
    const openTickets = await this.listTickets(
      {
        status: { $ne: TicketStatus.CLOSED },
      },
      { take: UNREAD_REPLY_TICKET_LIMIT },
    )

    const ticketIds = openTickets.map((ticket) => (ticket as { id: string }).id)
    if (ticketIds.length === 0) {
      return 0
    }

    const messageEvents = await this.listTicketEvents(
      { ticket: ticketIds, event_type: TicketEventType.MESSAGE_ADDED },
      { order: { created_at: 'DESC' }, take: UNREAD_REPLY_EVENT_LIMIT },
    )

    const latestSenderByTicket = new Map<string, string | null>()
    for (const event of messageEvents as Array<{
      ticket_id: string
      performed_by_type: string | null
    }>) {
      if (!latestSenderByTicket.has(event.ticket_id)) {
        latestSenderByTicket.set(event.ticket_id, event.performed_by_type)
      }
    }

    let count = 0
    for (const senderType of latestSenderByTicket.values()) {
      if (senderType === SenderTypeValues.CUSTOMER) count++
    }

    return count
  }

  /**
   * List tickets that have waiting customer replies (latest message from customer).
   */
  async listTicketsWithCustomerReplies(pagination?: PaginationParams) {
    const allOpen = await this.listTickets(
      { status: { $ne: TicketStatus.CLOSED } },
      { order: { updated_at: 'DESC' }, take: pagination?.take ?? 50, skip: pagination?.skip ?? 0 },
    )
    return allOpen
  }
}
