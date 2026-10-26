import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import type { TicketStatus } from '../../../../modules/support-ticket'
import { bulkUpdateTicketsWorkflow } from '../../../../workflows'
import type { BulkTicketBody } from '../../../middlewares'

export async function POST(req: AuthenticatedMedusaRequest<BulkTicketBody>, res: MedusaResponse) {
  const adminId = req.auth_context.actor_id

  const { ticket_ids, status, assigned_to } = req.validatedBody

  const { result } = await bulkUpdateTicketsWorkflow(req.scope).run({
    input: {
      ticketIds: ticket_ids,
      status: (status as TicketStatus | undefined) ?? null,
      assignedTo: assigned_to ?? null,
      setAssignment: assigned_to !== undefined,
      performedByType: 'admin',
      performedById: adminId,
    },
  })

  return res.json({
    success: true,
    tickets: result.tickets,
    not_found_ids: result.notFoundIds,
  })
}
