export type Ticket = {
  id: string
  subject: string
  category: string
  status: string
  assigned_to: string | null
  customer_id: string
  order_id: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  metadata: Record<string, unknown> | null
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
  created_at: string
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
