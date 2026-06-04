export type GenerateResponseResult = {
  message: string
  confidence: number
}

export type EscalationToolCall = {
  name: 'escalateTicket'
  arguments: {
    reason: string
  }
}

export type ActionDecision = {
  action: 'reply' | 'escalate' | 'no_action'
  reply?: string | null
  confidence: number
  category?: string
  tool_call?: EscalationToolCall | null
}

export type AIProviderConfig = {
  provider: string
  api_key: string
  model: string
  base_url: string
}

export interface AIProvider {
  generateResponse(input: {
    subject: string
    message: string
    conversationHistory: string[]
    category: string
    systemPrompt?: string
  }): Promise<GenerateResponseResult>

  analyzeSupportMessage(input: {
    ticketId: string
    message: string
    customer?: unknown
    order?: unknown
    history?: string[]
    systemPrompt?: string
    escalationRules?: string
  }): Promise<ActionDecision>
}
