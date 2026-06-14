import { model } from '@medusajs/framework/utils'
import { Ticket } from './ticket'

export const TicketNote = model
  .define('ticket_note', {
    id: model.id().primaryKey(),
    ticket: model.belongsTo(() => Ticket, {
      mappedBy: 'notes',
    }),
    content: model.text(),
    author_id: model.text().nullable(),
  })
  .indexes([{ on: ['ticket_id'] }])
