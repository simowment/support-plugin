import { SubscriberArgs, type SubscriberConfig } from '@medusajs/framework'
import type { Logger } from '@medusajs/framework/types'
import { TicketEventName } from '../modules/support-ticket'
import { ticketEventBus } from '../api/shared/event-bus'
import { getErrorMessage } from '../api/shared/helpers'

const TICKET_CATEGORY_LABELS: Record<string, string> = {
  order_issue: 'Order Issue',
  return_request: 'Return Request',
  fulfillment_issue: 'Fulfillment Issue',
  product_inquiry: 'Product Inquiry',
  payment_issue: 'Payment Issue',
  general: 'General',
}

type TicketNotificationData = {
  id: string
  ticket_id?: string
  subject?: string
  category?: string
  customer_id?: string
  order_id?: string | null
  message?: string
  sender_type?: string
  sender_id?: string
  status?: string
}

function buildDiscordFields(data: TicketNotificationData) {
  const ticketId = data.ticket_id || data.id
  const categoryLabel = data.category
    ? (TICKET_CATEGORY_LABELS[data.category] ?? data.category)
    : 'N/A'

  const fields = [
    { name: 'Ticket ID', value: ticketId, inline: true },
    { name: 'Category', value: categoryLabel, inline: true },
    { name: 'Customer', value: data.customer_id ?? 'N/A', inline: true },
  ]

  if (data.subject) {
    fields.push({ name: 'Subject', value: data.subject, inline: false })
  }

  if (data.order_id) {
    fields.push({ name: 'Order', value: data.order_id, inline: false })
  }

  if (data.message && data.sender_type === 'customer') {
    const preview = data.message.length > 300 ? data.message.slice(0, 297) + '...' : data.message
    fields.push({ name: 'Message', value: preview, inline: false })
  }

  return fields
}

async function sendDiscordWebhook(
  logger: Logger,
  event: string,
  data: TicketNotificationData,
  title: string,
  color: number,
) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (!webhookUrl) return

  const fields = buildDiscordFields(data)
  const payload = {
    embeds: [
      {
        title,
        color,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    const message = getErrorMessage(error)
    logger.warn(`[Support Tickets] Failed to send Discord notification: ${message}`)
  }
}

export default async function ticketNotificationHandler({
  event: { name, data },
  container,
}: SubscriberArgs<TicketNotificationData>) {
  const logger = container.resolve('logger')

  logger.info(`[Support Tickets] Event: ${name} ticket=${data.id || data.ticket_id}`)

  const ticketId = data.ticket_id || data.id

  // Emit to SSE event bus for real-time clients
  switch (name) {
    case TicketEventName.CREATED:
      ticketEventBus.emit({ ticketId, type: 'status_changed', payload: { status: 'open' } })
      await sendDiscordWebhook(logger, name, data, '🎫 New Support Ticket', 0x3b82f6)
      break

    case TicketEventName.MESSAGE_ADDED:
      ticketEventBus.emit({
        ticketId,
        type: 'message_added',
        payload: { senderType: data.sender_type },
      })
      if (data.sender_type === 'customer') {
        await sendDiscordWebhook(logger, name, data, '💬 New Customer Reply', 0xf59e0b)
      }
      break

    case TicketEventName.UPDATED:
      ticketEventBus.emit({
        ticketId,
        type: 'status_changed',
        payload: { status: data.status },
      })
      break

    case TicketEventName.CLOSED:
      ticketEventBus.emit({ ticketId, type: 'status_changed', payload: { status: 'closed' } })
      await sendDiscordWebhook(logger, name, data, '✅ Ticket Closed', 0x22c55e)
      break
  }
}

export const config: SubscriberConfig = {
  event: [
    TicketEventName.CREATED,
    TicketEventName.MESSAGE_ADDED,
    TicketEventName.UPDATED,
    TicketEventName.CLOSED,
    TicketEventName.DELETED,
  ],
}
