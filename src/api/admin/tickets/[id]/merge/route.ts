import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService, requireAdminAuth, sendError } from '../../../../shared/helpers'

type MergeBody = {
  source_ticket_id?: unknown
}

export async function POST(req: MedusaRequest<MergeBody>, res: MedusaResponse) {
  const adminId = requireAdminAuth(req, res)
  if (!adminId) return

  const { source_ticket_id } = req.body ?? {}

  if (typeof source_ticket_id !== 'string' || !source_ticket_id.trim()) {
    return sendError(res, 400, 'VALIDATION', 'source_ticket_id is required and must be a string.')
  }

  const targetTicketId = req.params.id
  const sourceTicketId = source_ticket_id.trim()

  if (sourceTicketId === targetTicketId) {
    return sendError(res, 400, 'VALIDATION', 'Cannot merge a ticket with itself.')
  }

  const service = resolveTicketService(req)

  try {
    const result = await service.mergeTickets(sourceTicketId, targetTicketId, 'admin', adminId)
    return res.json({ success: true, ...result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Merge failed'
    return sendError(res, 400, 'MERGE_FAILED', message)
  }
}