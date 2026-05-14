import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import {
  VALID_STATUSES,
  requireAdminAuth,
  resolveTicketService,
  sendError,
  validateEnum,
} from '../../../shared/helpers'

const MAX_BULK_TICKETS = 50

type BulkTicketBody = {
  ticket_ids?: unknown
  status?: string
  assigned_to?: string | null
}

function readTicketIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const ids = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return ids.length === value.length ? ids : null
}

export async function POST(req: MedusaRequest<BulkTicketBody>, res: MedusaResponse) {
  const adminId = requireAdminAuth(req, res)
  if (!adminId) return

  const body = req.body ?? {}
  const ticketIds = readTicketIds(body.ticket_ids)

  if (!ticketIds || ticketIds.length === 0) {
    return sendError(res, 400, 'INVALID_TICKET_IDS', 'ticket_ids must be a non-empty string array')
  }

  if (ticketIds.length > MAX_BULK_TICKETS) {
    return sendError(res, 400, 'TOO_MANY_TICKETS', `Bulk updates are limited to ${MAX_BULK_TICKETS} tickets`)
  }

  if (body.status === undefined && body.assigned_to === undefined) {
    return sendError(res, 400, 'NO_UPDATES', 'Provide status or assigned_to')
  }

  const statusError = validateEnum(body.status, VALID_STATUSES, 'status')
  if (statusError) {
    return sendError(res, 400, 'INVALID_STATUS', statusError)
  }

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
