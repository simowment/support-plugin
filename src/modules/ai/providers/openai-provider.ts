import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import type { AIProvider, GenerateResponseResult, ActionDecision } from '../types'
import { API_TIMEOUT_MS } from '../constants'

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export type OpenAIProviderConfig = {
  apiKey: string
  model: string
  baseUrl: string
  headers?: Record<string, string>
}

/**
 * A failed AI call, classified. `config`: the key, credit, model, address or instructions are
 * wrong and it will not fix itself (HTTP 401/402/403/404, connection refused, host not found);
 * `transient`: timeout, HTTP 429/5xx, an unusable reply. `label` is short ("HTTP 401").
 */
export class AiProviderError extends Error {
  constructor(
    message: string,
    public kind: 'config' | 'transient',
    public label: string,
    public status?: number,
  ) {
    super(message)
    this.name = 'AiProviderError'
  }
}

export class ProviderAuthError extends AiProviderError {
  constructor(message: string, status: number) {
    super(message, 'config', `HTTP ${status}`, status)
    this.name = 'ProviderAuthError'
  }
}

const CONFIG_HTTP_STATUSES = new Set([401, 402, 403, 404])
const CONFIG_NETWORK_CODES: Record<string, string> = {
  ECONNREFUSED: 'connection refused',
  ENOTFOUND: 'host not found',
  ERR_INVALID_URL: 'invalid address',
}

type SdkError = {
  name?: unknown
  statusCode?: unknown
  status?: unknown
  code?: unknown
  cause?: unknown
  lastError?: unknown
  errors?: unknown
  responseBody?: { error?: { code?: unknown } }
}

/** HTTP status and network code from an AI SDK error (RetryError.lastError, APICallError.cause chain). */
function errorFacts(error: unknown): { status?: number; code?: string; timeout: boolean } {
  const facts: { status?: number; code?: string; timeout: boolean } = { timeout: false }
  const seen = new Set<unknown>()
  const queue: unknown[] = [error]
  while (queue.length && seen.size < 10) {
    const current = queue.shift() as SdkError | undefined
    if (!current || typeof current !== 'object' || seen.has(current)) continue
    seen.add(current)
    const status = current.statusCode ?? current.status ?? current.responseBody?.error?.code
    if (facts.status === undefined && typeof status === 'number') facts.status = status
    if (facts.code === undefined && typeof current.code === 'string') facts.code = current.code
    if (current.name === 'AbortError' || current.name === 'TimeoutError') facts.timeout = true
    queue.push(
      current.lastError,
      current.cause,
      ...(Array.isArray(current.errors) ? current.errors : []),
    )
  }
  return facts
}

export class OpenAIProvider implements AIProvider {
  private model: ReturnType<ReturnType<typeof createOpenAI>['languageModel']>
  private client: ReturnType<typeof createOpenAI>

  constructor(config: OpenAIProviderConfig) {
    this.client = createOpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      headers: config.headers,
    })
    // Chat Completions (POST {baseURL}/chat/completions), like every other AI feature of the shop.
    this.model = this.client.chat(config.model)
  }

  private createAbortSignal(): AbortSignal {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), API_TIMEOUT_MS)
    return controller.signal
  }

  /**
   * Wraps SDK calls: auth errors become ProviderAuthError (the service clears its cached
   * client), every other failure an AiProviderError with its kind, for the Store problem.
   */
  private wrapCall<T>(fn: () => Promise<T>): Promise<T> {
    return fn().catch((error) => {
      const { status, code, timeout } = errorFacts(error)
      if (status === 401 || status === 403) {
        throw new ProviderAuthError(error?.message ?? 'AI provider auth error', status)
      }
      const networkLabel = code ? CONFIG_NETWORK_CODES[code] : undefined
      const message = `AI provider error${status ? ` (${status})` : code ? ` (${code})` : ''}: ${getErrorMessage(error)}`
      if (status !== undefined) {
        throw new AiProviderError(
          message,
          CONFIG_HTTP_STATUSES.has(status) ? 'config' : 'transient',
          `HTTP ${status}`,
          status,
        )
      }
      if (networkLabel) throw new AiProviderError(message, 'config', networkLabel)
      throw new AiProviderError(
        message,
        'transient',
        timeout ? 'timed out' : code ? 'network error' : 'unusable reply',
      )
    })
  }

  /** Returns structured action decision. */
  async analyzeSupportMessage(input: {
    ticketId: string
    message: string
    customer?: unknown
    order?: unknown
    history?: string[]
    systemPrompt?: string
    escalationRules?: string
  }): Promise<ActionDecision> {
    if (!input.systemPrompt) {
      throw new AiProviderError(
        'AI analysis failed: No system prompt configured. Please set one in the AI Support settings.',
        'config',
        'no analysis instructions set',
      )
    }

    const history = input.history?.join('\n') || 'No previous messages.'

    const contextParts: string[] = []
    if (input.customer) {
      contextParts.push(`Customer info: ${JSON.stringify(input.customer)}`)
    }
    if (input.order) {
      contextParts.push(`Order info: ${JSON.stringify(input.order)}`)
    }

    const userMessage = [
      contextParts.length > 0 ? contextParts.join('\n') : '',
      `Conversation so far:\n${history}`,
      `Customer's latest message:\n${input.message || 'No message content provided.'}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    const systemPrompt = input.systemPrompt.replace(
      'Rules:',
      `Rules:\n${input.escalationRules || ''}`,
    )

    return this.wrapCall(async () => {
      const { object } = await generateObject({
        model: this.model,
        system: systemPrompt,
        prompt: userMessage,
        schema: z.object({
          action: z.enum(['reply', 'escalate', 'no_action']),
          reply: z.string().nullable().describe('The drafted reply to the customer, if any.'),
          confidence: z.number().min(0).max(1).describe('Confidence in the chosen action.'),
          category: z.string().describe('Short category name for the ticket.'),
          tool_call: z
            .object({
              name: z.literal('escalateTicket'),
              arguments: z.object({
                reason: z.string(),
              }),
            })
            .nullable(),
        }),
        abortSignal: this.createAbortSignal(),
      })

      return object as ActionDecision
    })
  }

  async generateResponse(input: {
    subject: string
    message: string
    conversationHistory: string[]
    category: string
    systemPrompt?: string
  }): Promise<GenerateResponseResult> {
    if (!input.systemPrompt) {
      throw new AiProviderError(
        'AI response generation failed: No response prompt configured. Please set one in the AI Support settings.',
        'config',
        'no reply instructions set',
      )
    }

    const history = input.conversationHistory.join('\n') || 'No previous messages.'

    return this.wrapCall(async () => {
      const { object } = await generateObject({
        model: this.model,
        system: input.systemPrompt,
        prompt: [
          `Category: ${input.category}`,
          `Subject: ${input.subject}`,
          '',
          `Conversation so far:\n${history}`,
          '',
          `Customer's latest message:\n${input.message || 'No message content provided.'}`,
        ].join('\n'),
        schema: z.object({
          message: z.string().describe('The final response message.'),
          confidence: z.number().min(0).max(1).describe('Confidence in the generated response.'),
        }),
        abortSignal: this.createAbortSignal(),
      })

      return object as GenerateResponseResult
    })
  }
}
