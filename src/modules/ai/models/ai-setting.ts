import { model } from '@medusajs/framework/utils'

export const AISetting = model
  .define('ai_setting', {
    id: model.id().primaryKey(),
    key: model.text(),
    value: model.text(),
  })
  .indexes([{ on: ['key'], unique: true }])
