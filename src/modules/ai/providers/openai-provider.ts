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

export class ProviderAuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'ProviderAuthError'
  }
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
    this.model = this.client(config.model)
  }

  private createAbortSignal(): AbortSignal {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), API_TIMEOUT_MS)
    return controller.signal
  }

  /** Wraps SDK calls to map auth errors to ProviderAuthError for cache-invalidation in the service. */
  private wrapCall<T>(fn: () => Promise<T>): Promise<T> {
    return fn().catch((error) => {
      const status = error?.statusCode ?? error?.status ?? error?.responseBody?.error?.code
      if (status === 401 || status === 403) {
        throw new ProviderAuthError(error.message ?? 'AI provider auth error', status)
      }

      throw new Error(`AI provider error${status ? ` (${status})` : ''}: ${getErrorMessage(error)}`)
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
      throw new Error(
        'AI analysis failed: No system prompt configured. Please set one in the AI Support settings.',
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
      throw new Error(
        'AI response generation failed: No response prompt configured. Please set one in the AI Support settings.',
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
