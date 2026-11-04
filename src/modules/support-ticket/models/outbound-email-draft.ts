import { model } from '@medusajs/framework/utils'

export const OutboundEmailDraft = model.define('ticket_outbound_email_draft', {
  id: model.id().primaryKey(),
  ticket_id: model.text(),
  body: model.text(),
  revision: model.number().default(1),
  status: model.text().default('draft'),
  recipient_email: model.text(),
  subject: model.text(),
  frozen_payload: model.json().nullable(),
  idempotency_key: model.text().nullable(),
  email_queue_id: model.text().nullable(),
  sent_by: model.text().nullable(),
})
