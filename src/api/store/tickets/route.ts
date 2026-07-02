import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import {
  resolveTicketService,
  requireAuth,
  parsePagination,
  sanitize,
  sendError,
} from '../../shared/helpers'
import { TicketCategory } from '../../../modules/support-ticket'
import type { CreateTicketBody, ListStoreTicketsQuery } from '../../middlewares'

export async function POST(req: AuthenticatedMedusaRequest<CreateTicketBody>, res: MedusaResponse) {
  const customerId = requireAuth(req, res)
  if (!customerId) return

  const { subject, category, message, order_id, metadata } = req.validatedBody

  const cleanSubject = sanitize(subject)
  const cleanMessage = sanitize(message)

  if (!cleanSubject) return sendError(res, 400, 'VALIDATION', 'Subject must contain text.')
  if (!cleanMessage) return sendError(res, 400, 'VALIDATION', 'Message must contain text.')

  const service = resolveTicketService(req)
  const ticket = await service.createTicket({
    subject: cleanSubject,
    category: category as TicketCategory,
    customerId,
    orderId: order_id,
    message: cleanMessage,
    metadata,
  })

  return res.status(201).json({ success: true, ticket })
}

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, ListStoreTicketsQuery>,
  res: MedusaResponse,
) {
  const customerId = requireAuth(req, res)
  if (!customerId) return

  const service = resolveTicketService(req)
  const { take, skip } = parsePagination(req.validatedQuery)
  const { status } = req.validatedQuery

  const tickets = await service.listCustomerTickets(customerId, { status }, { take, skip })
  return res.json({ success: true, tickets })
}
