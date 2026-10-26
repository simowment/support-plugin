import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { MedusaError } from '@medusajs/framework/utils'
import { resolveTicketService, ticketNotFound } from '../../../shared/helpers'
import type { TicketStatus } from '../../../../modules/support-ticket'
import { updateTicketWorkflow } from '../../../../workflows'
import type { UpdateTicketBody } from '../../../middlewares'

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = resolveTicketService(req)
  const result = await service.getTicketWithMessages(req.params.id)
  if (!result) return ticketNotFound(res)
  return res.json({ success: true, ...result })
}

export async function POST(req: AuthenticatedMedusaRequest<UpdateTicketBody>, res: MedusaResponse) {
  const adminId = req.auth_context.actor_id

  const { status, assigned_to } = req.validatedBody

  try {
    const { result } = await updateTicketWorkflow(req.scope).run({
      input: {
        ticketId: req.params.id,
        status: (status as TicketStatus | undefined) ?? null,
        assignedTo: assigned_to ?? null,
        setAssignment: assigned_to !== undefined,
        performedByType: 'admin',
        performedById: adminId,
      },
    })

    return res.json({ success: true, ticket: result })
  } catch (error) {
    if (error instanceof MedusaError && error.type === MedusaError.Types.NOT_FOUND) {
      return ticketNotFound(res)
    }
    throw error
  }
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = resolveTicketService(req)
  const adminId = req.auth_context.actor_id

  const deleted = await service.deleteTicket(req.params.id, 'admin', adminId)
  if (!deleted) return ticketNotFound(res)
  return res.json({ success: true, id: deleted.id, deleted: true })
}
