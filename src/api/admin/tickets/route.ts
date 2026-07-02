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

  const { tickets, count } = await service.listAdminTickets(req.validatedQuery, { take, skip })

  return res.json({ success: true, tickets, count, limit: take, offset: skip })
}
