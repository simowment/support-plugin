import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import {
  resolveTicketService,
  ticketNotFound,
  sanitize,
  sendError,
} from '../../../../shared/helpers'
import { SenderType } from '../../../../../modules/support-ticket'
import type { MessageBody } from '../../../../middlewares'
import { attachTicketAttachmentUrls } from '../../../../shared/attachments'

export async function POST(req: AuthenticatedMedusaRequest<MessageBody>, res: MedusaResponse) {
  const customerId = req.auth_context.actor_id

  const { message, attachments } = req.validatedBody

  const cleanMessage = message ? sanitize(message) : ''
  if (!cleanMessage && !attachments?.length)
    return sendError(res, 400, 'VALIDATION', 'Message or attachments are required.')

  const service = resolveTicketService(req)
  const result = await service.getTicketWithMessages(req.params.id)
  if (!result || result.ticket.customer_id !== customerId) return ticketNotFound(res)

  const msg = await service.addMessage({
    ticketId: req.params.id,
    message: cleanMessage,
    senderType: SenderType.CUSTOMER,
    senderId: customerId,
    attachments: attachTicketAttachmentUrls(req.params.id, attachments),
  })

  return res.status(201).json({ success: true, message: msg })
}
