import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import {
  resolveTicketService,
  sendError,
  getErrorMessage,
} from '../../../../shared/helpers'
import type { MergeTicketBody } from '../../../../middlewares'

export async function POST(req: AuthenticatedMedusaRequest<MergeTicketBody>, res: MedusaResponse) {
  const adminId = req.auth_context.actor_id

  const { source_ticket_id } = req.validatedBody

  const targetTicketId = req.params.id
  const sourceTicketId = source_ticket_id

  if (sourceTicketId === targetTicketId) {
    return sendError(res, 400, 'VALIDATION', 'Cannot merge a ticket with itself.')
  }

  const service = resolveTicketService(req)

  try {
    const result = await service.mergeTickets(sourceTicketId, targetTicketId, 'admin', adminId)
    return res.json({ success: true, ...result })
  } catch (error: unknown) {
    const message = getErrorMessage(error)
    return sendError(res, 400, 'MERGE_FAILED', message)
  }
}
