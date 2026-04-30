import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import SupportTicketModuleService from '../../../modules/support-ticket/service'
import { SUPPORT_TICKET_MODULE, TicketCategory, TicketPriority } from '../../../modules/support-ticket'

type CreateTicketBody = {
  subject?: string
  category?: string
  priority?: string
  message?: string
  order_id?: string
  metadata?: Record<string, unknown>
}

const VALID_CATEGORIES = new Set<string>(Object.values(TicketCategory))
const VALID_PRIORITIES = new Set<string>(Object.values(TicketPriority))

export async function POST(
  req: AuthenticatedMedusaRequest<CreateTicketBody>,
  res: MedusaResponse,
) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: 'Authentication required' })
  }

  const { subject, category, priority, message, order_id, metadata } = req.body

  if (!subject?.trim()) {
    return res.status(400).json({ message: 'Subject is required.' })
  }
  if (!message?.trim()) {
    return res.status(400).json({ message: 'Message is required.' })
  }
  if (!category || !VALID_CATEGORIES.has(category)) {
    return res.status(400).json({
      message: `Category is required. Valid values: ${Object.values(TicketCategory).join(', ')}`,
    })
  }
  if (priority && !VALID_PRIORITIES.has(priority)) {
    return res.status(400).json({
      message: `Invalid priority. Valid values: ${Object.values(TicketPriority).join(', ')}`,
    })
  }

  const supportTicketService: SupportTicketModuleService =
    req.scope.resolve(SUPPORT_TICKET_MODULE)

  const ticket = await supportTicketService.createTicket({
    subject: subject.trim(),
    category: category as TicketCategory,
    customerId,
    orderId: order_id,
    priority: (priority as TicketPriority) ?? undefined,
    message: message.trim(),
    metadata,
  })

  return res.status(201).json({ ticket })
}

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ message: 'Authentication required' })
  }

  const supportTicketService: SupportTicketModuleService =
    req.scope.resolve(SUPPORT_TICKET_MODULE)

  const status = req.query['status'] as string | undefined
  const tickets = await supportTicketService.listCustomerTickets(
    customerId,
    status ? { status } : undefined,
  )

  return res.json({ tickets })
}
