import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import {
  resolveTicketService,
  requireAdminAuth,
  ticketNotFound,
  sanitize,
  sendError,
  type MessageBody,
  MESSAGE_MAX_LENGTH,
} from '../../../../shared/helpers'
import { SenderType } from '../../../../../modules/support-ticket'

export async function POST(req: MedusaRequest<MessageBody>, res: MedusaResponse) {
  const { message, attachments } = req.body
  if (!message?.trim() && !attachments?.length) {
    return sendError(res, 400, 'VALIDATION', 'Message or attachments are required.')
  }

  const adminId = requireAdminAuth(req, res)
  if (!adminId) return

  const cleanMessage = message ? sanitize(message) : ''
  if (cleanMessage.length > MESSAGE_MAX_LENGTH) {
    return sendError(
      res,
      400,
      'VALIDATION',
      `Message must be under ${MESSAGE_MAX_LENGTH} characters.`,
    )
  }

  const service = resolveTicketService(req)
  const result = await service.getTicketWithMessages(req.params.id)
  if (!result) return ticketNotFound(res)

  const msg = await service.addMessage({
    ticketId: req.params.id,
    message: cleanMessage,
    senderType: SenderType.ADMIN,
    senderId: adminId,
    attachments,
  })

  return res.status(201).json({ success: true, message: msg })
}
