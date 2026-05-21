import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import {
  resolveTicketService,
  requireAdminAuth,
  validateEnum,
  VALID_STATUSES,
  ticketNotFound,
} from '../../../shared/helpers'
import { TicketStatus } from '../../../../modules/support-ticket'

type UpdateTicketBody = {
  status?: string
  assigned_to?: string | null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveTicketService(req)
  const result = await service.getTicketWithMessages(req.params.id)
  if (!result) return ticketNotFound(res)
  return res.json({ success: true, ...result })
}

export async function PATCH(req: MedusaRequest<UpdateTicketBody>, res: MedusaResponse) {
  const { status, assigned_to } = req.body

  const statusError = validateEnum(status, VALID_STATUSES, 'status')
  if (statusError) return res.status(400).json({ success: false, error: statusError })

  const service = resolveTicketService(req)
  const adminId = requireAdminAuth(req, res)
  if (!adminId) return

  const ticket = await service.updateTicket(
    req.params.id,
    { status: status as TicketStatus | undefined, assignedTo: assigned_to },
    'admin',
    adminId,
  )
  if (!ticket) return ticketNotFound(res)
  return res.json({ success: true, ticket })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveTicketService(req)
  const adminId = requireAdminAuth(req, res)
  if (!adminId) return

  const deleted = await service.deleteTicket(req.params.id, 'admin', adminId)
  if (!deleted) return ticketNotFound(res)
  return res.json({ success: true, id: deleted.id, deleted: true })
}
