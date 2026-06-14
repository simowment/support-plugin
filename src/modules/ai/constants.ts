export const SUPPORT_TICKET_AI_MODULE = 'supportTicketAi'

export const CONFIDENCE_THRESHOLD_AUTO_REPLY = 0.85

export const DEFAULT_MODEL = 'poolside/laguna-xs.2:free'
export const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
export const DEFAULT_PROVIDER = 'openrouter'
export const API_TIMEOUT_MS = 30000

export const PROVIDER_SETTING_KEY = 'provider'
export const API_KEY_SETTING_KEY = 'api_key'
export const MODEL_SETTING_KEY = 'model'
export const BASE_URL_SETTING_KEY = 'base_url'
export const SUPPORT_TICKET_AI_KEY_ENCRYPTION_KEY = 'SUPPORT_TICKET_AI_KEY_ENCRYPTION_KEY'
export const PROVIDER_KEYS = [
  PROVIDER_SETTING_KEY,
  API_KEY_SETTING_KEY,
  MODEL_SETTING_KEY,
  BASE_URL_SETTING_KEY,
] as const
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
