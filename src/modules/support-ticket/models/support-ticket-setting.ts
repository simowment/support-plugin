import { model } from '@medusajs/framework/utils'

/**
 * Settings changed in the admin (Support inbox > Settings). One row per key; the value is
 * a JSON-encoded scalar. A missing row means "use the module option or the default".
 * Never holds secrets: those stay in the host environment.
 */
export const SupportTicketSetting = model
  .define('support_ticket_setting', {
    id: model.id({ prefix: 'tkset' }).primaryKey(),
    key: model.text(),
    value: model.text(),
  })
  .indexes([{ on: ['key'], unique: true }])
