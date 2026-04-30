import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import SupportTicketModuleService from '../../../../modules/support-ticket/service'
import { SUPPORT_TICKET_MODULE } from '../../../../modules/support-ticket'

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: 'Authentication required' })
  }

  const supportTicketService: SupportTicketModuleService =
    req.scope.resolve(SUPPORT_TICKET_MODULE)

  const result = await supportTicketService.getTicketWithMessages(req.params.id)
  if (!result) {
    return res.status(404).json({ message: 'Ticket not found' })
  }

  if ((result.ticket as any).customer_id !== customerId) {
    return res.status(404).json({ message: 'Ticket not found' })
  }

  return res.json(result)
}
