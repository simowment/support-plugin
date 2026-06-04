import { Module } from '@medusajs/framework/utils'
import SupportTicketAIModuleService from './service'
import { SUPPORT_TICKET_AI_MODULE } from './constants'

export default Module(SUPPORT_TICKET_AI_MODULE, {
  service: SupportTicketAIModuleService,
})

export { SUPPORT_TICKET_AI_MODULE } from './constants'
export { AITicketAnalysis } from './models/ai-ticket-analysis'
export { AISetting } from './models/ai-setting'
export type { AIProvider, AIProviderConfig, GenerateResponseResult, ActionDecision } from './types'
