import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService } from '../../../shared/helpers'

/**
 * GET /admin/tickets/notifications
 * Returns counts and recent tickets with customer replies for admin notification indicators.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveTicketService(req)

  const [unreadCustomerReplyCount, tickets] = await Promise.all([
    service.getUnreadCustomerReplyCount(),
    service.listTicketsWithCustomerReplies({ take: 100 }),
  ])
  const recentTickets = tickets as Array<{
    id: string
    subject: string
    status: string
    customer_id: string
    updated_at: string | Date
  }>

  return res.json({
    success: true,
    recent_ticket_count: unreadCustomerReplyCount,
    total_open_tickets: tickets.length,
    recent_tickets: recentTickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      customer_id: t.customer_id,
      updated_at: new Date(t.updated_at).toISOString(),
    })),
  })
}
