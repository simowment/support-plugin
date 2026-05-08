import { model } from '@medusajs/framework/utils'
import { Ticket } from './ticket'

export const TicketEvent = model.define('ticket_event', {
  id: model.id().primaryKey(),
  ticket: model.belongsTo(() => Ticket, {
    mappedBy: 'events',
  }),
  event_type: model.text(),
  data: model.json().nullable(),
  performed_by_type: model.text().nullable(),
  performed_by_id: model.text().nullable(),
})
  .indexes([
    { on: ['ticket_id'] },
    { on: ['event_type'] },
  ])
