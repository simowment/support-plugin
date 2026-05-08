import { model } from '@medusajs/framework/utils'

export const TicketNote = model.define('ticket_note', {
  id: model.id().primaryKey(),
  ticket_id: model.text(),
  content: model.text(),
  author_id: model.text().nullable(),
}).indexes([
  { on: ['ticket_id'] },
])
