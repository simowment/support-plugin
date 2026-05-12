import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService, requireAuth, ticketNotFound, sanitize, sendError, type MessageBody } from '../../../../shared/helpers'
import { SenderType } from '../../../../../modules/support-ticket'

const MESSAGE_MAX_LENGTH = 10000

export async function POST(req: AuthenticatedMedusaRequest<MessageBody>, res: MedusaResponse) {
  const customerId = requireAuth(req, res)
  if (!customerId) return

  const { message, attachments } = req.body
  if (!message?.trim() && !attachments?.length) {
    return sendError(res, 400, 'VALIDATION', 'Message or attachments are required.')
  }

  const cleanMessage = message ? sanitize(message) : ''
  if (cleanMessage.length > MESSAGE_MAX_LENGTH) {
    return sendError(res, 400, 'VALIDATION', `Message must be under ${MESSAGE_MAX_LENGTH} characters.`)
  }

  const service = resolveTicketService(req)
  const result = await service.getTicketWithMessages(req.params.id)
  if (!result || (result.ticket as any).customer_id !== customerId) return ticketNotFound(res)

  const msg = await service.addMessage({
    ticketId: req.params.id,
    message: cleanMessage,
    senderType: SenderType.CUSTOMER,
    senderId: customerId,
    attachments,
  })

  return res.status(201).json({ success: true, message: msg })
}
