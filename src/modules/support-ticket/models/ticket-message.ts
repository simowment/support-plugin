import { model } from '@medusajs/framework/utils'
import { Ticket } from './ticket'

export const TicketMessage = model.define('ticket_message', {
  id: model.id().primaryKey(),
  ticket: model.belongsTo(() => Ticket, {
    mappedBy: 'messages',
  }),
  sender_type: model.text(),
  sender_id: model.text().nullable(),
  message: model.text(),
  attachments: model.json().nullable(),
})
