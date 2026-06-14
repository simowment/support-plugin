import { MedusaService, MedusaError } from '@medusajs/framework/utils'
import type { Logger } from '@medusajs/framework/types'
import { z } from 'zod'
import { AITicketAnalysis } from './models/ai-ticket-analysis'
import { AISetting } from './models/ai-setting'
import {
  CONFIDENCE_THRESHOLD_AUTO_REPLY,
  DEFAULT_MODEL,
  DEFAULT_BASE_URL,
  DEFAULT_PROVIDER,
  PROVIDER_KEYS,
  PROMPT_KEYS,
  BLOCKED_AUTO_REPLY_CATEGORIES,
  MAX_HISTORY_MESSAGES,
  MAX_HISTORY_CHARS,
  API_KEY_SETTING_KEY,
  BASE_URL_SETTING_KEY,
  MODEL_SETTING_KEY,
  PROVIDER_SETTING_KEY,
} from './constants'
import type { ActionDecision, AIProvider, AIProviderConfig } from './types'
import {
  OpenAIProvider,
  ProviderAuthError,
  type OpenAIProviderConfig,
} from './providers/openai-provider'
import { ActionDecisionSchema } from './validation'
import {
  decryptApiKey,
  encryptApiKey,
  isInvalidEncryptedApiKeyError,
} from './api-key-encryption'

type AnalysisRecord = {
  id: string
  ticket_id: string
  category: string | null
  auto_reply_eligible: boolean
  auto_replied: boolean
  auto_replied_at: Date | null
  suggested_response: string | null
  response_confidence: number | null
  metadata: Record<string, unknown> | null
}

type EscalationDecision = {
  reason: string
}

type AnalyzeTicketInput = {
  ticketId: string
  subject: string
  message: string
  category: string
  customerId?: string | null
  orderId?: string | null
}

type AnalyzeMessageInput = {
  ticketId: string
  message: string
  senderType: string
  conversationHistory: string[]
  existingAnalysis?: AnalysisRecord | null
}

type ProviderConfig = AIProviderConfig
type ProviderSettingKey = (typeof PROVIDER_KEYS)[number]
type AISettingRecord = {
  key: ProviderSettingKey
  value: string
}

const ModuleOptionsSchema = z
  .object({
    openai_api_key: z.string().min(1).optional(),
    openai_model: z.string().min(1).optional(),
    openai_base_url: z.string().url().optional(),
    openai_headers: z.record(z.string()).optional(),
  })
  .passthrough()

type ModuleOptions = z.infer<typeof ModuleOptionsSchema>

// Registry of provider factories — adding a new LLM backend is a one-entry change.
const PROVIDER_REGISTRY: Record<string, (config: OpenAIProviderConfig) => AIProvider> = {
  openai: (cfg) => new OpenAIProvider(cfg),
  openrouter: (cfg) => new OpenAIProvider(cfg),
  custom: (cfg) => new OpenAIProvider(cfg),
}

function preserveProviderSettingValue(value: string): string {
  return value
}

const PROVIDER_SETTING_VALUE_READERS: Record<
  ProviderSettingKey,
  (value: string) => string | undefined
> = {
  [PROVIDER_SETTING_KEY]: preserveProviderSettingValue,
  [API_KEY_SETTING_KEY]: decryptApiKey,
  [MODEL_SETTING_KEY]: preserveProviderSettingValue,
  [BASE_URL_SETTING_KEY]: preserveProviderSettingValue,
}

const PROVIDER_SETTING_VALUE_WRITERS: Record<ProviderSettingKey, (value: string) => string> = {
  [PROVIDER_SETTING_KEY]: preserveProviderSettingValue,
  [API_KEY_SETTING_KEY]: encryptApiKey,
  [MODEL_SETTING_KEY]: preserveProviderSettingValue,
  [BASE_URL_SETTING_KEY]: preserveProviderSettingValue,
}

function createProvider(config: AIProviderConfig, options?: ModuleOptions): AIProvider {
  const factory = PROVIDER_REGISTRY[config.provider] ?? PROVIDER_REGISTRY.custom
  return factory({
    apiKey: config.api_key,
    model: config.model || undefined,
    baseUrl: config.base_url || undefined,
    headers: options?.openai_headers,
  })
}

function limitHistory(history: string[]): string[] {
  return history
    .slice(-MAX_HISTORY_MESSAGES)
    .map((msg) => (msg.length > MAX_HISTORY_CHARS ? msg.slice(0, MAX_HISTORY_CHARS) : msg))
}

export default class SupportTicketAIModuleService extends MedusaService({
  AITicketAnalysis,
  AISetting,
}) {
  protected options_: ModuleOptions
  private logger_: Logger
  private cachedProvider: AIProvider | null = null
  private cachedConfigKey = ''

  constructor(container: { logger?: Logger }, options?: ModuleOptions) {
    super(...arguments)
    this.logger_ = container.logger ?? (console as unknown as Logger)
    this.options_ = ModuleOptionsSchema.parse(options ?? {})
  }

  // --- Provider config ---

  private getConfigKey(config: ProviderConfig): string {
    const headerHash = config.headers ? JSON.stringify(config.headers) : ''
    return `${config.provider}:${config.api_key}:${config.model}:${config.base_url}:${headerHash}`
  }

  private readProviderSetting(setting: AISettingRecord): string | undefined {
    try {
      return PROVIDER_SETTING_VALUE_READERS[setting.key](setting.value)
    } catch (error) {
      if (setting.key === API_KEY_SETTING_KEY && isInvalidEncryptedApiKeyError(error)) {
        this.logger_.warn(
          '[support-ticket-ai] Ignoring invalid persisted AI API key; re-save the key in AI Support settings.',
        )
        return undefined
      }

      throw error
    }
  }

  async getProviderConfig(): Promise<ProviderConfig> {
    const settings = await this.listAISettings({ key: PROVIDER_KEYS })

    const map: Partial<Record<ProviderSettingKey, string>> = {}
    for (const s of settings as AISettingRecord[]) {
      const value = this.readProviderSetting(s)
      if (value !== undefined) {
        map[s.key] = value
      }
    }

    return {
      provider: map[PROVIDER_SETTING_KEY] ?? DEFAULT_PROVIDER,
      api_key: map[API_KEY_SETTING_KEY] ?? this.options_.openai_api_key ?? '',
      model: map[MODEL_SETTING_KEY] ?? this.options_.openai_model ?? DEFAULT_MODEL,
      base_url: map[BASE_URL_SETTING_KEY] ?? this.options_.openai_base_url ?? DEFAULT_BASE_URL,
      headers: this.options_.openai_headers,
    }
  }

  async getPromptConfig(): Promise<Record<string, string>> {
    const settings = await this.listAISettings({ key: PROMPT_KEYS })

    const map: Record<string, string> = {}
    for (const s of settings as Array<{ key: string; value: string }>) {
      map[s.key] = s.value
    }

    return {
      analysis_system_prompt: map['analysis_system_prompt'] ?? '',
      response_system_prompt: map['response_system_prompt'] ?? '',
      escalation_rules: map['escalation_rules'] ?? '',
    }
  }

  async setPromptConfig(config: Partial<Record<string, string>>): Promise<Record<string, string>> {
    for (const key of PROMPT_KEYS) {
      const value = config[key]
      if (value === undefined) continue

      const [existing] = await this.listAISettings({ key }, { take: 1 })
      if (existing) {
        await this.updateAISettings([
          {
            id: existing.id,
            value: String(value),
          },
        ])
      } else {
        await this.createAISettings([{ key, value: String(value) }])
      }
    }

    return this.getPromptConfig()
  }

  async setProviderConfig(config: Partial<ProviderConfig>): Promise<ProviderConfig> {
    for (const key of PROVIDER_KEYS) {
      const value = config[key]
      if (value === undefined) continue
      const storedValue = PROVIDER_SETTING_VALUE_WRITERS[key](String(value))

      const [existing] = await this.listAISettings({ key }, { take: 1 })
      if (existing) {
        await this.updateAISettings([
          {
            id: existing.id,
            value: storedValue,
          },
        ])
      } else {
        await this.createAISettings([{ key, value: storedValue }])
      }
    }

    this.cachedProvider = null
    this.cachedConfigKey = ''

    return this.getProviderConfig()
  }

  async getProvider(): Promise<AIProvider> {
    const config = await this.getProviderConfig()
    const configKey = this.getConfigKey(config)

    if (this.cachedProvider && this.cachedConfigKey === configKey) {
      return this.cachedProvider
    }

    if (!config.api_key) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        'AI provider not configured. Set the API key in AI Support settings.',
      )
    }

    const provider = createProvider(config, this.options_)

    this.cachedProvider = provider
    this.cachedConfigKey = configKey
    return provider
  }

  // --- Enable/disable settings ---

  async isEnabled(): Promise<boolean> {
    const [setting] = await this.listAISettings({ key: 'enabled' }, { take: 1 })
    if (!setting) return true
    return setting.value === 'true'
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const [existing] = await this.listAISettings({ key: 'enabled' }, { take: 1 })
    if (existing) {
      await this.updateAISettings([
        {
          id: existing.id,
          value: String(enabled),
        },
      ])
    } else {
      await this.createAISettings([
        {
          key: 'enabled',
          value: String(enabled),
        },
      ])
    }
  }

  async isAutoReplyEnabled(): Promise<boolean> {
    const [setting] = await this.listAISettings({ key: 'auto_reply_enabled' }, { take: 1 })
    if (!setting) return false
    return setting.value === 'true'
  }

  async setAutoReplyEnabled(enabled: boolean): Promise<void> {
    const [existing] = await this.listAISettings({ key: 'auto_reply_enabled' }, { take: 1 })
    if (existing) {
      await this.updateAISettings([
        {
          id: existing.id,
          value: String(enabled),
        },
      ])
    } else {
      await this.createAISettings([
        {
          key: 'auto_reply_enabled',
          value: String(enabled),
        },
      ])
    }
  }

  // --- Auto-reply logic ---

  shouldAutoReply(analysis: AnalysisRecord): boolean {
    if (!analysis) return false
    if (analysis.auto_replied) return false
    if (!analysis.auto_reply_eligible) return false
    if (!analysis.suggested_response) return false
    if ((analysis.response_confidence ?? 0) < CONFIDENCE_THRESHOLD_AUTO_REPLY) return false

    const category = (analysis.category ?? '').toLowerCase().trim()
    if (BLOCKED_AUTO_REPLY_CATEGORIES.includes(category)) return false

    return true
  }

  /** Atomically marks an analysis as auto-replied. Returns false if already replied (prevents TOCTOU). */
  async markAutoReplied(analysisId: string): Promise<boolean> {
    const updated = await this.updateAITicketAnalyses({
      selector: { id: analysisId, auto_replied: false },
      data: { auto_replied: true, auto_replied_at: new Date() },
    })

    return Array.isArray(updated) ? updated.length > 0 : Boolean(updated)
  }

  // --- Core analysis methods ---

  /** Validates AI output and logs on failure. Returns validated decision or a safe fallback. */
  private validateDecision(raw: unknown, ticketId: string): ActionDecision {
    const result = ActionDecisionSchema.safeParse(raw)
    if (result.success) return result.data

    this.logger_.warn(
      `[support-ticket-ai] AI output validation failed for ticket ${ticketId}: ` +
        `errors=${JSON.stringify(result.error.issues)}`,
    )
    return {
      action: 'escalate',
      reply: null,
      confidence: 0,
      tool_call: null,
    }
  }

  async analyzeTicket(input: AnalyzeTicketInput): Promise<AnalysisRecord> {
    const provider = await this.getProvider()
    return this.withProviderCacheInvalidation(input.ticketId, () =>
      this._analyzeTicketWithProvider(provider, input),
    )
  }

  private async _analyzeTicketWithProvider(
    provider: AIProvider,
    input: AnalyzeTicketInput,
  ): Promise<AnalysisRecord> {
    const prompts = await this.getPromptConfig()

    const rawDecision = await provider.analyzeSupportMessage({
      ticketId: input.ticketId,
      message: `Subject: ${input.subject}\n\n${input.message}`,
      customer: input.customerId ? { id: input.customerId } : undefined,
      order: input.orderId ? { id: input.orderId } : undefined,
      history: [],
      systemPrompt: prompts.analysis_system_prompt || undefined,
      escalationRules: prompts.escalation_rules || undefined,
    })

    const d = this.validateDecision(rawDecision, input.ticketId)

    const category = d.category ?? input.category

    let suggestedResponse: string | null = null
    let responseConfidence: number | null = null
    const autoReplyEligible = d.action === 'reply' && Boolean(d.reply)

    if (d.action === 'reply' && d.reply) {
      suggestedResponse = d.reply
      responseConfidence = d.confidence
    }

    const [analysis] = await this.createAITicketAnalyses([
      {
        ticket_id: input.ticketId,
        category,
        auto_reply_eligible: autoReplyEligible,
        auto_replied: false,
        suggested_response: suggestedResponse,
        response_confidence: responseConfidence,
        metadata: { action_decision: d },
      },
    ])

    return analysis as AnalysisRecord
  }

  async analyzeMessage(input: AnalyzeMessageInput): Promise<{
    suggested_response: string | null
    response_confidence: number | null
  }> {
    const provider = await this.getProvider()
    return this.withProviderCacheInvalidation(input.ticketId, () =>
      this._analyzeMessageWithProvider(provider, input),
    )
  }

  private async _analyzeMessageWithProvider(
    provider: AIProvider,
    input: AnalyzeMessageInput,
  ): Promise<{
    suggested_response: string | null
    response_confidence: number | null
  }> {
    if (input.senderType !== 'customer') {
      return { suggested_response: null, response_confidence: null }
    }

    const limitedHistory = limitHistory(input.conversationHistory)
    const prompts = await this.getPromptConfig()

    const rawDecision = await provider.analyzeSupportMessage({
      ticketId: input.ticketId,
      message: input.message,
      history: limitedHistory,
      systemPrompt: prompts.analysis_system_prompt || undefined,
      escalationRules: prompts.escalation_rules || undefined,
    })

    const d = this.validateDecision(rawDecision, input.ticketId)

    if (input.existingAnalysis) {
      await this.updateAITicketAnalyses([
        {
          id: input.existingAnalysis.id,
          suggested_response:
            d.action === 'reply' && d.reply ? d.reply : input.existingAnalysis.suggested_response,
          response_confidence:
            d.action === 'reply' && d.reply
              ? d.confidence
              : input.existingAnalysis.response_confidence,
          auto_reply_eligible: d.action === 'reply' && Boolean(d.reply),
          category: d.category ?? input.existingAnalysis.category,
          metadata: {
            ...(input.existingAnalysis.metadata ?? {}),
            latest_action_decision: d,
          },
        },
      ])
    }

    return {
      suggested_response: d.action === 'reply' && d.reply ? d.reply : null,
      response_confidence: d.action === 'reply' && d.reply ? d.confidence : null,
    }
  }

  // --- Escalation helpers ---

  getEscalationDecision(
    analysis: AnalysisRecord,
    key: 'action_decision' | 'latest_action_decision' = 'action_decision',
  ): EscalationDecision | null {
    const decision = analysis.metadata?.[key] as ActionDecision | undefined
    const toolCall = decision?.tool_call
    if (decision?.action !== 'escalate' || toolCall?.name !== 'escalateTicket') {
      return null
    }
    return toolCall.arguments
  }

  private async withProviderCacheInvalidation<T>(
    ticketId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof ProviderAuthError) {
        this.cachedProvider = null
        this.cachedConfigKey = ''
        this.logger_.warn(
          `[support-ticket-ai] Provider auth error for ticket ${ticketId}, cache cleared`,
        )
      }
      throw error
    }
  }

  async getAnalysisForTicket(ticketId: string): Promise<AnalysisRecord | null> {
    const [analysis] = await this.listAITicketAnalyses(
      { ticket_id: ticketId },
      { take: 1, order: { updated_at: 'DESC' } },
    )
    return (analysis as AnalysisRecord) ?? null
  }
}
