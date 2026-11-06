import { SubscriberArgs, type SubscriberConfig } from '@medusajs/framework'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import {
  SUPPORT_TICKET_MODULE,
  SenderType,
  TicketEventName,
  type SupportTicketModuleService,
} from '../modules/support-ticket'

/**
 * Email an admin's reply (or an AI auto-reply) to a signed-in customer.
 *
 * Signed-in customers open tickets from the storefront, but the storefront has no
 * ticket inbox, so the reply is delivered by email. The email goes through the shop's
 * email queue (medusa-notification-smtp), which handles retries and blocked addresses.
 * When a reply domain is configured the Reply-To is a one-time `reply+<token>@` address,
 * so the customer's answer lands back on the ticket; otherwise it is the support mailbox.
 *
 * Guest tickets (email contacts without an account) are not handled here: they use the
 * reviewed draft flow in the admin ("Save draft" / "Send email").
 */

type MessageAddedData = {
  ticket_id: string
  message_id: string
  sender_type: string
  sender_id: string | null
  message: string
}

type EmailQueue = {
  enqueue(input: Record<string, unknown>): Promise<string>
  getJobByIdempotencyKey?(key: string): Promise<{ id: string } | null>
}

type QueryGraph = {
  graph(input: {
    entity: string
    fields: string[]
    filters: Record<string, unknown>
  }): Promise<{ data: Array<Record<string, unknown>> }>
}

type Logger = { info(message: string): void; warn(message: string): void }

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  )
}

export default async function emailAdminReplyToCustomer({
  event: { data },
  container,
}: SubscriberArgs<MessageAddedData>) {
  // Admin replies, and AI auto-replies (sender "system"), are answers to the customer.
  if (data.sender_type !== SenderType.ADMIN && data.sender_type !== SenderType.SYSTEM) return

  const logger = container.resolve<Logger>('logger')
  const ticketService: SupportTicketModuleService = container.resolve(SUPPORT_TICKET_MODULE)
  const config = ticketService.getConfig()
  if (!config.emailCustomerReplies) return

  const ticket = await ticketService.getTicketById(data.ticket_id)
  if (!ticket?.customer_id) return

  const prefix = `[support-ticket-reply] ticket ${data.ticket_id}`

  const queue = container.resolve<EmailQueue | undefined>(config.emailQueueModule, {
    allowUnregistered: true,
  })
  if (!queue || typeof queue.enqueue !== 'function') {
    logger.warn(
      `${prefix}: no email queue registered as "${config.emailQueueModule}"; the customer was not emailed`,
    )
    return
  }

  const query = container.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY)
  const { data: customers } = await query.graph({
    entity: 'customer',
    fields: ['id', 'email', 'first_name'],
    filters: { id: ticket.customer_id },
  })
  const customer = customers[0] as { email?: string | null; first_name?: string | null } | undefined
  const to = customer?.email?.trim()
  if (!to) {
    logger.warn(`${prefix}: the customer has no email address; reply not emailed`)
    return
  }

  // A redelivered event must not issue a second reply token or a second email.
  const idempotencyKey = `support-ticket-admin-reply:${data.message_id}`
  if (await queue.getJobByIdempotencyKey?.(idempotencyKey)) return

  const replyTo = await ticketService.resolveReplyToAddress(ticket.id, to)
  const subject = `Re: ${ticket.subject}`.replace(/[\r\n]+/g, ' ').slice(0, 200)
  const greeting = customer?.first_name ? `Hello ${customer.first_name},` : 'Hello,'
  const footer = replyTo?.startsWith('reply+')
    ? 'Reply to this email to answer; your message is added to the same support request.'
    : 'Reply to this email if you need anything else.'
  const text = `${greeting}\n\n${data.message}\n\n${footer}`
  const html =
    `<div style="font-family:Arial,sans-serif;line-height:1.5">` +
    `<p>${escapeHtml(greeting)}</p>` +
    `<div style="white-space:pre-wrap">${escapeHtml(data.message)}</div>` +
    `<p style="color:#666;font-size:13px">${escapeHtml(footer)}</p></div>`

  const jobId = await queue.enqueue({
    idempotencyKey,
    recipientEmail: to,
    subject,
    templateKey: '__inline__',
    payload: { to, subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) },
    category: 'transactional',
    metadata: {
      source: 'support-ticket-reply',
      ticket_id: ticket.id,
      message_id: data.message_id,
    },
  })

  logger.info(`${prefix}: reply queued for the customer (email job ${jobId})`)
}

export const config: SubscriberConfig = {
  event: TicketEventName.MESSAGE_ADDED,
  context: { subscriberId: 'support-ticket-reply-email' },
}
