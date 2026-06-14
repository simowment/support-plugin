import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService, requireAuth, ticketNotFound } from '../../../shared/helpers'

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireAuth(req, res)
  if (!customerId) return

  const service = resolveTicketService(req)
  const result = await service.getTicketWithMessages(req.params.id)
  if (!result || result.ticket.customer_id !== customerId) return ticketNotFound(res)

  const { ticket, messages, events } = result
  return res.json({ success: true, ticket, messages, events })
}
