import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import SupportTicketModuleService from '../../../modules/support-ticket/service'
import { SUPPORT_TICKET_MODULE } from '../../../modules/support-ticket'

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const supportTicketService: SupportTicketModuleService =
    req.scope.resolve(SUPPORT_TICKET_MODULE)

  const status = req.query['status'] as string | undefined
  const category = req.query['category'] as string | undefined
  const customer_id = req.query['customer_id'] as string | undefined

  const filters: Record<string, unknown> = {}
  if (status) filters.status = status
  if (category) filters.category = category
  if (customer_id) filters.customer_id = customer_id

  const tickets = await supportTicketService.listTickets(filters, {
    order: { created_at: 'DESC' },
    take: parseInt(req.query['limit'] as string) || 50,
    skip: parseInt(req.query['offset'] as string) || 0,
  })

  return res.json({ tickets })
}
