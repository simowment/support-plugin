import { SubscriberArgs, type SubscriberConfig } from '@medusajs/framework'
import { TicketEventName } from '../modules/support-ticket'

export default async function ticketNotificationHandler({
  event: { data },
  container,
}: SubscriberArgs<{
  id: string
  subject?: string
  category?: string
  customer_id?: string
  order_id?: string | null
  message?: string
  ticket_id?: string
  sender_type?: string
  sender_id?: string
}>) {
  const logger = container.resolve("logger")

  // Log only metadata, not message content (avoid PII in logs)
  logger.info(`[Support Tickets] Event: ${JSON.stringify({
    id: data.id || data.ticket_id,
    type: data.sender_type,
  })}`)

  // TODO: Integrate with notification module for email/SMS
  // Example:
  // const notificationService = container.resolve('notification')
  // await notificationService.createNotifications({
  //   to: adminEmail,
  //   channel: 'email',
  //   template: 'ticket-created',
  //   data: { ticketId: data.id, subject: data.subject }
  // })
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
