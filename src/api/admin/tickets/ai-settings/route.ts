import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { MedusaError } from '@medusajs/framework/utils'
import SupportTicketAIModuleService from '../../../../modules/ai/service'
import {
  SUPPORT_TICKET_AI_MODULE,
  PROVIDER_KEYS,
} from '../../../../modules/ai/constants'

// GET /admin/tickets/ai-settings
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const aiService: SupportTicketAIModuleService = req.scope.resolve(SUPPORT_TICKET_AI_MODULE)

  const [enabled, autoReplyEnabled, providerConfig, promptConfig] = await Promise.all([
    aiService.isEnabled(),
    aiService.isAutoReplyEnabled(),
    aiService.getProviderConfig(),
    aiService.getPromptConfig(),
  ])

  return res.json({
    enabled,
    auto_reply_enabled: autoReplyEnabled,
    provider: {
      provider: providerConfig.provider,
      model: providerConfig.model,
      base_url: providerConfig.base_url,
      has_api_key: Boolean(providerConfig.api_key),
      api_key_preview: maskApiKey(providerConfig.api_key),
    },
    prompts: promptConfig,
  })
}

// POST /admin/tickets/ai-settings
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const aiService: SupportTicketAIModuleService = req.scope.resolve(SUPPORT_TICKET_AI_MODULE)

  const body = req.body as Record<string, unknown>

  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, '`enabled` must be a boolean.')
  }

  if (body.auto_reply_enabled !== undefined && typeof body.auto_reply_enabled !== 'boolean') {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, '`auto_reply_enabled` must be a boolean.')
  }

  const hasProviderField = PROVIDER_KEYS.some((key) => body[key] !== undefined)

  const hasPromptField = [
    'analysis_system_prompt',
    'response_system_prompt',
    'escalation_rules',
  ].some((key) => body[key] !== undefined)

  if (hasProviderField) {
    for (const key of PROVIDER_KEYS) {
      const value = body[key]
      if (value !== undefined) {
        if (typeof value !== 'string') {
          throw new MedusaError(MedusaError.Types.INVALID_DATA, `\`${key}\` must be a string.`)
        }
        // Reject empty strings for all provider fields
        if (!value.trim()) {
          throw new MedusaError(MedusaError.Types.INVALID_DATA, `\`${key}\` cannot be empty.`)
        }
      }
    }
  }

  if (typeof body.enabled === 'boolean') {
    await aiService.setEnabled(body.enabled)
  }

  if (typeof body.auto_reply_enabled === 'boolean') {
    await aiService.setAutoReplyEnabled(body.auto_reply_enabled)
  }

  if (hasProviderField) {
    await aiService.setProviderConfig({
      provider: typeof body.provider === 'string' ? body.provider : undefined,
      api_key: typeof body.api_key === 'string' ? body.api_key : undefined,
      model: typeof body.model === 'string' ? body.model : undefined,
      base_url: typeof body.base_url === 'string' ? body.base_url : undefined,
    })
  }

  if (hasPromptField) {
    await aiService.setPromptConfig({
      analysis_system_prompt:
        typeof body.analysis_system_prompt === 'string' ? body.analysis_system_prompt : undefined,
      response_system_prompt:
        typeof body.response_system_prompt === 'string' ? body.response_system_prompt : undefined,
      escalation_rules:
        typeof body.escalation_rules === 'string' ? body.escalation_rules : undefined,
    })
  }

  const [enabled, autoReplyEnabled, providerConfig, promptConfig] = await Promise.all([
    aiService.isEnabled(),
    aiService.isAutoReplyEnabled(),
    aiService.getProviderConfig(),
    aiService.getPromptConfig(),
  ])

  return res.json({
    enabled,
    auto_reply_enabled: autoReplyEnabled,
    provider: {
      provider: providerConfig.provider,
      model: providerConfig.model,
      base_url: providerConfig.base_url,
      has_api_key: Boolean(providerConfig.api_key),
      api_key_preview: maskApiKey(providerConfig.api_key),
    },
    prompts: promptConfig,
  })
}

function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return key ? '••••••••' : ''
  return key.slice(0, 4) + '••••••••' + key.slice(-4)
}
