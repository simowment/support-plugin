import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import SupportTicketModuleService from '../../../../../modules/support-ticket/service'
import { SUPPORT_TICKET_MODULE, SenderType } from '../../../../../modules/support-ticket'

type AddMessageBody = {
  message?: string
  attachments?: Record<string, unknown>[]
}

export async function POST(
  req: AuthenticatedMedusaRequest<AddMessageBody>,
  res: MedusaResponse,
) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ success: false, error: 'Authentication required' })
  }

  const { message, attachments } = req.body
  if (!message?.trim() && !attachments?.length) {
    return res.status(400).json({ success: false, error: 'Message or attachments are required.' })
  }

  const supportTicketService: SupportTicketModuleService =
    req.scope.resolve(SUPPORT_TICKET_MODULE)

  const result = await supportTicketService.getTicketWithMessages(req.params.id)
  if (!result || (result.ticket as any).customer_id !== customerId) {
    return res.status(404).json({ success: false, error: 'Ticket not found' })
  }

  const msg = await supportTicketService.addMessage({
    ticketId: req.params.id,
    message: message?.trim() || '(attachment)',
    senderType: SenderType.CUSTOMER,
    senderId: customerId,
    attachments,
  })

  return res.status(201).json({ success: true, message: msg })
}
