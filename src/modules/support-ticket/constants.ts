export const SUPPORT_TICKET_MODULE = 'supportTicket'

export const TicketStatus = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  WAITING_CUSTOMER: 'waiting_customer',
  WAITING_ADMIN: 'waiting_admin',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
} as const

export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus]



export const TicketCategory = {
  ORDER_ISSUE: 'order_issue',
  RETURN_REQUEST: 'return_request',
  FULFILLMENT_ISSUE: 'fulfillment_issue',
  PRODUCT_INQUIRY: 'product_inquiry',
  PAYMENT_ISSUE: 'payment_issue',
  GENERAL: 'general',
} as const

export type TicketCategory = (typeof TicketCategory)[keyof typeof TicketCategory]

export const SenderType = {
  CUSTOMER: 'customer',
  ADMIN: 'admin',
  SYSTEM: 'system',
} as const

export type SenderType = (typeof SenderType)[keyof typeof SenderType]

export const TicketEventType = {
  STATUS_CHANGED: 'status_changed',
  MESSAGE_ADDED: 'message_added',
  TICKET_CREATED: 'ticket_created',
  TICKET_CLOSED: 'ticket_closed',
  TICKET_REOPENED: 'ticket_reopened',
  TICKET_DELETED: 'ticket_deleted',
} as const

export type TicketEventType = (typeof TicketEventType)[keyof typeof TicketEventType]

export const TicketEventName = {
  CREATED: 'support_ticket.created',
  MESSAGE_ADDED: 'support_ticket.message_added',
  UPDATED: 'support_ticket.updated',
  CLOSED: 'support_ticket.closed',
  DELETED: 'support_ticket.deleted',
} as const
