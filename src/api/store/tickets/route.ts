import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService, requireAuth, validateEnum, VALID_CATEGORIES, parsePagination } from '../../shared/helpers'
import { TicketCategory } from '../../../modules/support-ticket'

type CreateTicketBody = {
  subject?: string
  category?: string
  message?: string
  order_id?: string
  metadata?: Record<string, unknown>
}

export async function POST(req: AuthenticatedMedusaRequest<CreateTicketBody>, res: MedusaResponse) {
  const customerId = requireAuth(req, res)
  if (!customerId) return

  const { subject, category, message, order_id, metadata } = req.body

  if (!subject?.trim()) return res.status(400).json({ success: false, error: 'Subject is required.' })
  if (!message?.trim()) return res.status(400).json({ success: false, error: 'Message is required.' })

  const categoryError = validateEnum(category, VALID_CATEGORIES, 'category')
  if (!category || categoryError) {
    return res.status(400).json({ success: false, error: categoryError || 'Category is required.' })
  }

  const service = resolveTicketService(req)
  const ticket = await service.createTicket({
    subject: subject.trim(),
    category: category as TicketCategory,
    customerId,
    orderId: order_id,
    message: message.trim(),
    metadata,
  })

  return res.status(201).json({ success: true, ticket })
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireAuth(req, res)
  if (!customerId) return

  const service = resolveTicketService(req)
  const { take, skip } = parsePagination(req)
  const status = req.query['status'] as string | undefined

  const tickets = await service.listCustomerTickets(customerId, { status }, { take, skip })
  return res.json({ success: true, tickets })
}
