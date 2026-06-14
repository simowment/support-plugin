import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { requireAdminAuth, resolveTicketService, parsePagination } from '../../shared/helpers'

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const adminId = requireAdminAuth(req, res)
  if (!adminId) return

  const service = resolveTicketService(req)
  const { take, skip } = parsePagination(req)

  const filters: Record<string, unknown> = {}
  const validatedQuery = req.validatedQuery as Record<string, string | number | undefined>
  for (const key of ['status', 'category', 'customer_id', 'assigned_to']) {
    const value = validatedQuery[key] as string | undefined
    if (value) filters[key] = value
  }

  const tickets = await service.listTickets(filters, { order: { created_at: 'DESC' }, take, skip })
  return res.json({ success: true, tickets })
}
