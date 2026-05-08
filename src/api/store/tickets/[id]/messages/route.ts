import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService, requireAuth, ticketNotFound, type MessageBody } from '../../../../shared/helpers'
import { SenderType } from '../../../../../modules/support-ticket'

export async function POST(req: AuthenticatedMedusaRequest<MessageBody>, res: MedusaResponse) {
  const customerId = requireAuth(req, res)
  if (!customerId) return

  const { message, attachments } = req.body
  if (!message?.trim() && !attachments?.length) {
    return res.status(400).json({ success: false, error: 'Message or attachments are required.' })
  }

  const service = resolveTicketService(req)
  const result = await service.getTicketWithMessages(req.params.id)
  if (!result || (result.ticket as any).customer_id !== customerId) return ticketNotFound(res)

  const msg = await service.addMessage({
    ticketId: req.params.id,
    message: message?.trim() || '',
    senderType: SenderType.CUSTOMER,
    senderId: customerId,
    attachments,
  })

  return res.status(201).json({ success: true, message: msg })
}
