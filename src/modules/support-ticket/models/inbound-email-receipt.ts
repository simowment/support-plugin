import { model } from '@medusajs/framework/utils'

export const InboundEmailReceipt = model
  .define('ticket_inbound_email_receipt', {
    id: model.id().primaryKey(),
    recipient_email: model.text(),
    message_id: model.text(),
    sender_email: model.text(),
    provider_token_hash: model.text().nullable(),
    payload_hash: model.text().nullable(),
    ticket_id: model.text().nullable(),
    ticket_message_id: model.text().nullable(),
  })
  .indexes([
    { on: ['recipient_email', 'message_id'], unique: true },
    { on: ['provider_token_hash'], unique: true },
  ])
