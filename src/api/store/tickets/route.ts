import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService, requireAuth, validateEnum, VALID_CATEGORIES, parsePagination, sanitize, sendError } from '../../shared/helpers'
import { TicketCategory } from '../../../modules/support-ticket'

type CreateTicketBody = {
  subject?: string
  category?: string
  message?: string
  order_id?: string
  metadata?: Record<string, unknown>
}

const SUBJECT_MAX_LENGTH = 200
const MESSAGE_MAX_LENGTH = 10000

export async function POST(req: AuthenticatedMedusaRequest<CreateTicketBody>, res: MedusaResponse) {
  const customerId = requireAuth(req, res)
  if (!customerId) return

  const { subject, category, message, order_id, metadata } = req.body

  if (!subject?.trim()) return sendError(res, 400, 'VALIDATION', 'Subject is required.')
  if (!message?.trim()) return sendError(res, 400, 'VALIDATION', 'Message is required.')

  const cleanSubject = sanitize(subject)
  const cleanMessage = sanitize(message)

  if (!cleanSubject) return sendError(res, 400, 'VALIDATION', 'Subject must contain text.')
  if (!cleanMessage) return sendError(res, 400, 'VALIDATION', 'Message must contain text.')
  if (cleanSubject.length > SUBJECT_MAX_LENGTH) return sendError(res, 400, 'VALIDATION', `Subject must be under ${SUBJECT_MAX_LENGTH} characters.`)
  if (cleanMessage.length > MESSAGE_MAX_LENGTH) return sendError(res, 400, 'VALIDATION', `Message must be under ${MESSAGE_MAX_LENGTH} characters.`)

  const categoryError = validateEnum(category, VALID_CATEGORIES, 'category')
  if (!category || categoryError) {
    return sendError(res, 400, 'VALIDATION', categoryError || 'Category is required.')
  }

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

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireAuth(req, res)
  if (!customerId) return

  const service = resolveTicketService(req)
  const { take, skip } = parsePagination(req)
  const status = req.query['status'] as string | undefined

  const tickets = await service.listCustomerTickets(customerId, { status }, { take, skip })
  return res.json({ success: true, tickets })
}
