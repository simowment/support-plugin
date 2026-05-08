import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService, requireAdminAuth, ticketNotFound, type MessageBody } from '../../../../shared/helpers'
import { SenderType } from '../../../../../modules/support-ticket'

export async function POST(req: MedusaRequest<MessageBody>, res: MedusaResponse) {
  const { message, attachments } = req.body
  if (!message?.trim() && !attachments?.length) {
    return res.status(400).json({ success: false, error: 'Message or attachments are required.' })
  }

  const adminId = requireAdminAuth(req, res)
  if (!adminId) return

  const service = resolveTicketService(req)
  const result = await service.getTicketWithMessages(req.params.id)
  if (!result) return ticketNotFound(res)

  const msg = await service.addMessage({
    ticketId: req.params.id,
    message: message?.trim() || '',
    senderType: SenderType.ADMIN,
    senderId: adminId,
    attachments,
  })

  return res.status(201).json({ success: true, message: msg })
}
