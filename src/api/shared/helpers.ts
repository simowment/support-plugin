import { MedusaRequest, MedusaResponse, AuthenticatedMedusaRequest } from '@medusajs/framework/http'
import SupportTicketModuleService from '../../modules/support-ticket/service'
import { SUPPORT_TICKET_MODULE, TicketStatus, TicketCategory } from '../../modules/support-ticket'

export const VALID_STATUSES = new Set<string>(Object.values(TicketStatus))
export const VALID_CATEGORIES = new Set<string>(Object.values(TicketCategory))

export const DEFAULT_LIMIT = 50
export const DEFAULT_OFFSET = 0

export function resolveTicketService(req: MedusaRequest): SupportTicketModuleService {
  return req.scope.resolve(SUPPORT_TICKET_MODULE)
}

export function requireAuth(req: AuthenticatedMedusaRequest, res: MedusaResponse): string | null {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ success: false, error: 'Authentication required' })
    return null
  }
  return customerId
}

export function requireAdminAuth(req: MedusaRequest, res: MedusaResponse): string | null {
  const adminId = (req as any).auth_context?.actor_id
  if (!adminId) {
    res.status(401).json({ success: false, error: 'Authentication required' })
    return null
  }
  return adminId
}

export function parsePagination(req: MedusaRequest) {
  return {
    take: parseInt(req.query['limit'] as string) || DEFAULT_LIMIT,
    skip: parseInt(req.query['offset'] as string) || DEFAULT_OFFSET,
  }
}

export function validateEnum(value: string | undefined, validValues: Set<string>, label: string): string | null {
  if (value && !validValues.has(value)) {
    return `Invalid ${label}. Valid values: ${Array.from(validValues).join(', ')}`
  }
  return null
}

export function ticketNotFound(res: MedusaResponse) {
  return res.status(404).json({ success: false, error: 'Ticket not found' })
}

export type MessageBody = {
  message?: string
  attachments?: Record<string, unknown>[]
}
