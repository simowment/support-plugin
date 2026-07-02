import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService, ticketNotFound } from '../../../shared/helpers'

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context.actor_id

  const service = resolveTicketService(req)
  const result = await service.getTicketWithMessages(req.params.id)
  if (!result || result.ticket.customer_id !== customerId) return ticketNotFound(res)

  const { ticket, messages, events } = result
  return res.json({ success: true, ticket, messages, events })
}
