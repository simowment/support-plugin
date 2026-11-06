export type Ticket = {
  id: string
  subject: string
  category: string
  status: string
  assigned_to: string | null
  customer_id: string | null
  contact_email: string | null
  contact_name: string | null
  order_id: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  metadata: Record<string, unknown> | null
  /** Present on list rows: the customer's name and email, or null when there is none. */
  customer?: {
    id: string
    email: string | null
    first_name: string | null
    last_name: string | null
  } | null
  /** True when the ticket points at a customer account that no longer exists. */
  customer_deleted?: boolean
}

/** GET /admin/tickets/config */
export type TicketsConfig = {
  inbound_email: { enabled: boolean; recipients: string[] }
  customer_replies: {
    email_enabled: boolean
    can_send: boolean
    reply_to: 'ticket' | 'support_mailbox' | 'store_sender'
    reason: string | null
  }
  guest_replies: { can_send: boolean; reason: string | null }
  ai: { enabled: boolean; configured: boolean; auto_reply_enabled: boolean }
  discord_notifications: boolean
}

export type AdminUser = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
}

export const userLabel = (user: AdminUser) =>
  [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email

/** Who wrote the ticket, for list rows and the context panel. */
export const customerLabel = (ticket: Ticket): string => {
  if (ticket.customer) {
    const name = [ticket.customer.first_name, ticket.customer.last_name].filter(Boolean).join(' ')
    return name || ticket.customer.email || 'Customer'
  }
  if (ticket.customer_deleted || ticket.metadata?.customer_deleted_at) return 'Deleted customer'
  if (ticket.customer_id) return 'Customer'
  return ticket.contact_name || ticket.contact_email || 'Email guest'
}

export type TicketMessage = {
  id: string
  sender_type: string
  sender_id: string | null
  message: string
  created_at: string
  attachments: unknown
}

export type Attachment = {
  id: string
  url: string
  filename: string
  mimeType: string
  size: number
}

export type TicketNote = {
  id: string
  ticket_id: string
  content: string
  author_id: string | null
  created_at: string
  updated_at: string
}

export type TicketEvent = {
  id: string
  event_type: string
  data: Record<string, unknown> | null
  performed_by_type: string | null
  performed_by_id?: string | null
  created_at: string
}

const STATUS_NAMES: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_customer: 'Waiting for customer',
  waiting_admin: 'Waiting for us',
  closed: 'Closed',
  resolved: 'Closed',
}

export const statusName = (status: string | null | undefined) =>
  status ? (STATUS_NAMES[status] ?? status.replace(/_/g, ' ')) : 'unknown'

/** One readable sentence per activity-log entry. */
export const describeTicketEvent = (
  event: TicketEvent,
  nameForUser: (id: string | null | undefined) => string,
): string => {
  const data = event.data ?? {}
  const text = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : null)
  const actor =
    event.performed_by_type === 'admin'
      ? nameForUser(event.performed_by_id)
      : event.performed_by_type === 'customer'
        ? 'The customer'
        : event.performed_by_type === 'system'
          ? 'The store'
          : 'Someone'

  switch (event.event_type) {
    case 'ticket_created':
      return text('channel') === 'email' || data.channel === 'email'
        ? 'Ticket created from an email.'
        : `The customer opened the ticket${text('category') ? ` (${statusName(text('category'))})` : ''}.`
    case 'message_added': {
      const sender = text('sender_type')
      if (sender === 'admin') return `${actor} replied.`
      if (sender === 'system') return 'An automatic reply was added.'
      return 'The customer wrote a message.'
    }
    case 'status_changed':
      return `${actor} changed the status from ${statusName(text('old_status'))} to ${statusName(text('new_status'))}.`
    case 'ticket_closed':
      return `${actor} closed the ticket.`
    case 'ticket_reopened':
      return text('reason') === 'message_received'
        ? 'The ticket reopened because a new message arrived.'
        : `${actor} reopened the ticket.`
    case 'assigned':
      return `${actor} assigned the ticket to ${nameForUser(text('new_assigned_to'))}.`
    case 'unassigned':
      return `${actor} removed the assignee.`
    case 'ticket_merged':
      if (text('merged_into')) return `${actor} merged this ticket into another one and closed it.`
      return `${actor} merged "${text('source_subject') ?? 'another ticket'}" into this one (${Number(data.messages_moved ?? 0)} messages, ${Number(data.notes_moved ?? 0)} notes moved).`
    case 'email_reply_queued':
      return `${actor} sent an email reply.`
    case 'ticket_deleted':
      return `${actor} deleted the ticket.`
    default:
      return event.event_type.replace(/_/g, ' ')
  }
}

export type TicketDetails = {
  ticket: Ticket
  messages: TicketMessage[]
  events: TicketEvent[]
  notes: TicketNote[]
}

export const STATUS_OPTIONS = ['open', 'in_progress', 'waiting_customer', 'waiting_admin', 'closed']

export const ACTIVE_STATUS_OPTIONS = STATUS_OPTIONS.filter((status) => status !== 'closed')

export const CATEGORY_OPTIONS = [
  'order_issue',
  'return_request',
  'fulfillment_issue',
  'product_inquiry',
  'payment_issue',
  'general',
]

export const CANNED_RESPONSES = [
  {
    label: 'Order status',
    value:
      'Thanks for reaching out. We are checking the latest status of your order and will update you shortly.',
  },
  {
    label: 'Return instructions',
    value:
      'We can help with your return. Please confirm the item condition and whether the original packaging is available.',
  },
  {
    label: 'Refund processing',
    value:
      'Your refund request is being reviewed. Once approved, refunds usually appear on the original payment method within a few business days.',
  },
]

export const TICKETS_POLL_MS = 15_000
export const DETAILS_POLL_MS = 5_000

export const formatDate = (value?: string | null) => {
  if (!value) return 'N/A'
  return new Date(value).toLocaleString()
}

export const isClosedStatus = (status: string) => status === 'closed' || status === 'resolved'
export const displayStatus = (status: string) => (status === 'resolved' ? 'closed' : status)

export const statusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'open':
      return 'blue'
    case 'in_progress':
      return 'orange'
    case 'closed':
    case 'resolved':
      return 'green'
    case 'waiting_admin':
      return 'red'
    case 'waiting_customer':
      return 'grey'
    default:
      return 'grey'
  }
}

export const normalizeAttachments = (attachments: unknown): Attachment[] => {
  if (!attachments) return []
  if (Array.isArray(attachments)) return attachments as Attachment[]
  if (typeof attachments === 'object' && attachments !== null && 'items' in attachments) {
    const obj = attachments as { items: Attachment[] }
    return Array.isArray(obj.items) ? obj.items : []
  }
  return []
}

export const getAttachmentUrl = (attachment: Attachment) => {
  const separator = attachment.url.includes('?') ? '&' : '?'
  return `${attachment.url}${separator}v=${attachment.size}`
}
