import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { requireAdminAuth, resolveTicketService, parsePagination } from '../../shared/helpers'
import type { ListAdminTicketsQuery } from '../../middlewares'

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, ListAdminTicketsQuery>,
  res: MedusaResponse,
) {
  const adminId = requireAdminAuth(req, res)
  if (!adminId) return

  const service = resolveTicketService(req)
  const { take, skip } = parsePagination(req.validatedQuery)

  const filters: Record<string, unknown> = {}
  for (const key of ['status', 'category', 'customer_id', 'assigned_to'] as const) {
    const value = req.validatedQuery[key]
    if (value) filters[key] = value
  }

  const tickets = await service.listTickets(filters, { order: { created_at: 'DESC' }, take, skip })
  return res.json({ success: true, tickets })
}
