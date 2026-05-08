import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService, parsePagination } from '../../shared/helpers'

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveTicketService(req)
  const { take, skip } = parsePagination(req)

  const filters: Record<string, unknown> = {}
  for (const key of ['status', 'category', 'customer_id', 'assigned_to']) {
    const value = req.query[key] as string | undefined
    if (value) filters[key] = value
  }

  const tickets = await service.listTickets(filters, { order: { created_at: 'DESC' }, take, skip })
  return res.json({ success: true, tickets })
}
