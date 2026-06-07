import { adminFetch } from '../../../lib/api'

export type AIAnalysis = {
  id: string
  ticket_id: string
  category: string | null
  category_confidence: number | null
  suggested_priority: string | null
  priority_confidence: number | null
  auto_reply_eligible: boolean
  auto_replied: boolean
  auto_replied_at: string | null
  suggested_response: string | null
  response_confidence: number | null
}

export type ProviderSettings = {
  provider: string
  model: string
  base_url: string
  has_api_key: boolean
  api_key_preview: string
}

export type PromptSettings = {
  analysis_system_prompt: string
  response_system_prompt: string
  escalation_rules: string
}

export type AISettings = {
  enabled: boolean
  auto_reply_enabled: boolean
  provider: ProviderSettings
  prompts: PromptSettings
}

export type SuggestionResult = {
  suggested_response: string
  confidence: number
}

const ANALYSIS_ENDPOINT = (ticketId: string) => `/admin/tickets/${ticketId}/ai`
const SUGGEST_ENDPOINT = (ticketId: string) => `/admin/tickets/${ticketId}/ai/suggest`
const SETTINGS_ENDPOINT = '/admin/tickets/ai-settings'

export const fetchAnalysis = (ticketId: string) =>
  adminFetch<{ analysis: AIAnalysis }>(ANALYSIS_ENDPOINT(ticketId)).then((d) => d.analysis)

export const generateSuggestion = (ticketId: string) =>
  adminFetch<SuggestionResult>(SUGGEST_ENDPOINT(ticketId), { method: 'POST' })

export const fetchAISettings = () => adminFetch<AISettings>(SETTINGS_ENDPOINT)

export const saveAIEnabled = (enabled: boolean) =>
  adminFetch<{ enabled: boolean }>(SETTINGS_ENDPOINT, { method: 'POST', body: { enabled } })

export const saveAutoReplyEnabled = (autoReplyEnabled: boolean) =>
  adminFetch<{ auto_reply_enabled: boolean }>(SETTINGS_ENDPOINT, {
    method: 'POST',
    body: { auto_reply_enabled: autoReplyEnabled },
  })

export const saveProviderConfig = (payload: {
  provider?: string
  model?: string
  base_url?: string
  api_key?: string
  analysis_system_prompt?: string
  response_system_prompt?: string
  escalation_rules?: string
}) =>
  adminFetch<{ provider: ProviderSettings; prompts: PromptSettings }>(SETTINGS_ENDPOINT, {
    method: 'POST',
    body: payload,
  })
