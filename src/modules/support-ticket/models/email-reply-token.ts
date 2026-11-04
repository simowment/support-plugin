import { model } from '@medusajs/framework/utils'

export const EmailReplyToken = model
  .define('ticket_email_reply_token', {
    id: model.id().primaryKey(),
    token_hash: model.text(),
    expected_sender_email: model.text(),
    ticket_id: model.text(),
    revoked_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ['token_hash'], unique: true }, { on: ['ticket_id'] }])
