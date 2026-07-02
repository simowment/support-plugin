import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService, requireAdminAuth, ticketNotFound } from '../../../shared/helpers'
import { TicketStatus } from '../../../../modules/support-ticket'
import type { UpdateTicketBody } from '../../../middlewares'

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const adminId = requireAdminAuth(req, res)
  if (!adminId) return

  const service = resolveTicketService(req)
  const result = await service.getTicketWithMessages(req.params.id)
  if (!result) return ticketNotFound(res)
  return res.json({ success: true, ...result })
}

export async function POST(req: AuthenticatedMedusaRequest<UpdateTicketBody>, res: MedusaResponse) {
  const adminId = requireAdminAuth(req, res)
  if (!adminId) return

  const { status, assigned_to } = req.validatedBody
  const service = resolveTicketService(req)

  const ticket = await service.updateTicket(
    req.params.id,
    { status: status as TicketStatus | undefined, assignedTo: assigned_to },
    'admin',
    adminId,
  )
  if (!ticket) return ticketNotFound(res)
  return res.json({ success: true, ticket })
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = resolveTicketService(req)
  const adminId = requireAdminAuth(req, res)
  if (!adminId) return

  const deleted = await service.deleteTicket(req.params.id, 'admin', adminId)
  if (!deleted) return ticketNotFound(res)
  return res.json({ success: true, id: deleted.id, deleted: true })
}
