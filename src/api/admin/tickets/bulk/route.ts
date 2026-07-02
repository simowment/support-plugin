import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService } from '../../../shared/helpers'
import type { BulkTicketBody } from '../../../middlewares'

export async function POST(req: AuthenticatedMedusaRequest<BulkTicketBody>, res: MedusaResponse) {
  const adminId = req.auth_context.actor_id

  const body = req.validatedBody
  const ticketIds = body.ticket_ids

  const service = resolveTicketService(req)
  const tickets: unknown[] = []
  const notFoundIds: string[] = []

  for (const ticketId of ticketIds) {
    const updated = await service.updateTicket(
      ticketId,
      {
        status: body.status as never,
        assignedTo: body.assigned_to,
      },
      'admin',
      adminId,
    )

    if (updated) {
      tickets.push(updated)
    } else {
      notFoundIds.push(ticketId)
    }
  }

  return res.json({ success: true, tickets, not_found_ids: notFoundIds })
}
