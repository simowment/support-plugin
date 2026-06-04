import { z } from 'zod'

export const EscalationToolCallSchema = z.object({
  name: z.literal('escalateTicket'),
  arguments: z.object({
    reason: z.string(),
  }),
})

export const ActionDecisionSchema = z.object({
  action: z.enum(['reply', 'escalate', 'no_action']),
  reply: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
  category: z.string().optional(),
  tool_call: EscalationToolCallSchema.nullable().optional(),
})
