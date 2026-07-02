import { MedusaRequest, MedusaResponse, AuthenticatedMedusaRequest } from '@medusajs/framework/http'
import SupportTicketModuleService from '../../modules/support-ticket/service'
import { SUPPORT_TICKET_MODULE, TicketStatus, TicketCategory } from '../../modules/support-ticket'

export const VALID_STATUSES = new Set<string>(Object.values(TicketStatus))
export const VALID_CATEGORIES = new Set<string>(Object.values(TicketCategory))

export const DEFAULT_LIMIT = 50
export const DEFAULT_OFFSET = 0

// Upload limits
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
export const MAX_FILES_PER_MESSAGE = 5
export const MESSAGE_MAX_LENGTH = 10000
export const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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

export function requireAdminAuth(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): string | null {
  const adminId = req.auth_context?.actor_id
  if (!adminId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', error: 'Authentication required' })
    return null
  }
  return adminId
}

type ValidatedPaginationQuery = {
  limit?: number
  offset?: number
}

export function parsePagination(query: ValidatedPaginationQuery) {
  const limit = query.limit ?? DEFAULT_LIMIT
  const offset = query.offset ?? DEFAULT_OFFSET
  return { take: limit, skip: offset }
}

export function validateEnum(
  value: string | undefined,
  validValues: Set<string>,
  label: string,
): string | null {
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
    .replace(/&lt;/g, '<') // decode entities first
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/<[^>]*>/g, '') // then strip HTML tags
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

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export type MessageBody = {
  message?: string
  attachments?: Record<string, unknown>[]
}
