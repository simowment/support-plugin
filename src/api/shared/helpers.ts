import { MedusaRequest, MedusaResponse, AuthenticatedMedusaRequest } from '@medusajs/framework/http'
import SupportTicketModuleService from '../../modules/support-ticket/service'
import { SUPPORT_TICKET_MODULE, TicketStatus, TicketCategory } from '../../modules/support-ticket'

export const VALID_STATUSES = new Set<string>(Object.values(TicketStatus))
export const VALID_CATEGORIES = new Set<string>(Object.values(TicketCategory))

export const DEFAULT_LIMIT = 50
export const DEFAULT_OFFSET = 0

// Upload limits
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024       // 10MB
export const MAX_FILES_PER_MESSAGE = 5
export const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
])

export function resolveTicketService(req: MedusaRequest): SupportTicketModuleService {
  return req.scope.resolve(SUPPORT_TICKET_MODULE)
}

export function requireAuth(req: AuthenticatedMedusaRequest, res: MedusaResponse): string | null {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', error: 'Authentication required' })
    return null
  }
  return customerId
}

export function requireAdminAuth(req: MedusaRequest, res: MedusaResponse): string | null {
  const adminId = (req as any).auth_context?.actor_id
  if (!adminId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', error: 'Authentication required' })
    return null
  }
  return adminId
}

export function parsePagination(req: MedusaRequest) {
  const rawLimit = parseInt(req.query['limit'] as string)
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit <= 100
    ? rawLimit
    : DEFAULT_LIMIT
  const rawOffset = parseInt(req.query['offset'] as string)
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : DEFAULT_OFFSET
  return { take: limit, skip: offset }
}

export function validateEnum(value: string | undefined, validValues: Set<string>, label: string): string | null {
  if (value && !validValues.has(value)) {
    return `Invalid ${label}. Valid values: ${Array.from(validValues).join(', ')}`
  }
  return null
}

/**
 * Strip HTML tags and dangerous content from user input.
 */
export function sanitize(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')          // strip HTML tags
    .replace(/&lt;/g, '<')             // decode harmless entities
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim()
}

/**
 * Send a structured error response.
 */
export function sendError(
  res: MedusaResponse,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return res.status(status).json({
    success: false,
    code,
    error: message,
    ...(details !== undefined ? { details } : {}),
  })
}

export function ticketNotFound(res: MedusaResponse) {
  return sendError(res, 404, 'TICKET_NOT_FOUND', 'Ticket not found')
}

export type MessageBody = {
  message?: string
  attachments?: Record<string, unknown>[]
}
