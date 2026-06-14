const ATTACHMENT_ROUTE_PREFIX = '/support-tickets/tickets'
const PENDING_ATTACHMENT_TICKET_ID = 'pending'

export type TicketAttachment = {
  id: string
  url: string
  filename: string
  mimeType: string
  size: number
}

export type TicketAttachmentInput = Omit<TicketAttachment, 'url'> & {
  url?: string
}

type MessageWithAttachments = {
  attachments?: unknown
}

type AttachmentContainer = {
  items?: unknown
}

function isTicketAttachment(value: unknown): value is TicketAttachment {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'url' in value &&
    typeof value.url === 'string' &&
    'filename' in value &&
    typeof value.filename === 'string' &&
    'mimeType' in value &&
    typeof value.mimeType === 'string' &&
    'size' in value &&
    typeof value.size === 'number'
  )
}

export function buildTicketAttachmentUrl(ticketId: string, fileId: string): string {
  return `${ATTACHMENT_ROUTE_PREFIX}/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(fileId)}`
}

export function buildPendingAttachmentUrl(fileId: string): string {
  return buildTicketAttachmentUrl(PENDING_ATTACHMENT_TICKET_ID, fileId)
}

export function attachTicketAttachmentUrls(
  ticketId: string,
  attachments?: TicketAttachmentInput[],
): TicketAttachment[] | undefined {
  return attachments?.map((attachment) => ({
    id: attachment.id,
    url: buildTicketAttachmentUrl(ticketId, attachment.id),
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
  }))
}

export function normalizeTicketAttachments(attachments: unknown): TicketAttachment[] {
  if (Array.isArray(attachments)) {
    return attachments.filter(isTicketAttachment)
  }

  if (typeof attachments === 'object' && attachments !== null && 'items' in attachments) {
    const container = attachments as AttachmentContainer
    return Array.isArray(container.items) ? container.items.filter(isTicketAttachment) : []
  }

  return []
}

export function findMessageAttachment(
  messages: MessageWithAttachments[],
  fileId: string,
): TicketAttachment | undefined {
  return messages
    .flatMap((message) => normalizeTicketAttachments(message.attachments))
    .find((attachment) => attachment.id === fileId)
}
