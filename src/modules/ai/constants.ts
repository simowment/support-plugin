export const SUPPORT_TICKET_AI_MODULE = 'supportTicketAi'

export const CONFIDENCE_THRESHOLD_AUTO_REPLY = 0.85

export const DEFAULT_MODEL = 'poolside/laguna-xs.2:free'
export const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
export const DEFAULT_PROVIDER = 'openrouter'
export const API_TIMEOUT_MS = 30000

export const PROVIDER_KEYS = ['provider', 'api_key', 'model', 'base_url'] as const
export const PROMPT_KEYS = [
  'analysis_system_prompt',
  'response_system_prompt',
  'escalation_rules',
] as const

export const BLOCKED_AUTO_REPLY_CATEGORIES = [
  'refund',
  'payment',
  'chargeback',
  'fraud',
  'legal',
  'complaint',
  'shipping_issue',
]

export const MAX_HISTORY_MESSAGES = 10
export const MAX_HISTORY_CHARS = 8000
