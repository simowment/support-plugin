import { model } from '@medusajs/framework/utils'
import { TicketMessage } from './ticket-message'
import { TicketEvent } from './ticket-event'

export const Ticket = model
  .define('ticket', {
    id: model.id().primaryKey(),
    subject: model.text(),
    category: model.text(),
    status: model.text().default('open'),
    customer_id: model.text(),
    assigned_to: model.text().nullable(),
    order_id: model.text().nullable(),
    closed_at: model.dateTime().nullable(),
    metadata: model.json().nullable(),
    messages: model.hasMany(() => TicketMessage, {
      mappedBy: 'ticket',
    }),
    events: model.hasMany(() => TicketEvent, {
      mappedBy: 'ticket',
    }),
  })
  .indexes([
    {
      on: ['customer_id', 'status'],
    },
    {
      on: ['assigned_to'],
    },
    {
      on: ['order_id'],
    },
    {
      on: ['status'],
    },
    {
      on: ['category'],
    },
  ])
