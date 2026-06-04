import { model } from '@medusajs/framework/utils'

// Stores AI analysis results for a support ticket.
// ticket_id references the core plugin's Ticket — resolved via container, not a relation.
export const AITicketAnalysis = model
  .define('ai_ticket_analysis', {
    id: model.id().primaryKey(),
    ticket_id: model.text(),
    category: model.text().nullable(),
    category_confidence: model.number().nullable(),
    suggested_priority: model.text().nullable(),
    priority_confidence: model.number().nullable(),
    sentiment_score: model.number().nullable(),
    urgency_score: model.number().nullable(),
    auto_reply_eligible: model.boolean().default(false),
    auto_replied: model.boolean().default(false),
    auto_replied_at: model.dateTime().nullable(),
    suggested_response: model.text().nullable(),
    response_confidence: model.number().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([{ on: ['ticket_id'] }])
