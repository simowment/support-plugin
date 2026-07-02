import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import SupportTicketAIModuleService from '../../../../modules/ai/service'
import { SUPPORT_TICKET_AI_MODULE } from '../../../../modules/ai/constants'
import type { AISettingsBody } from '../../../middlewares'

// GET /admin/tickets/ai-settings
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
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
      api_key_preview: '',
    },
    prompts: promptConfig,
  })
}

// POST /admin/tickets/ai-settings
export async function POST(req: AuthenticatedMedusaRequest<AISettingsBody>, res: MedusaResponse) {
  const aiService: SupportTicketAIModuleService = req.scope.resolve(SUPPORT_TICKET_AI_MODULE)

  const body = req.validatedBody

  const hasProviderField = ['provider', 'api_key', 'model', 'base_url'].some(
    (key) => body[key as keyof AISettingsBody] !== undefined,
  )

  const hasPromptField = [
    'analysis_system_prompt',
    'response_system_prompt',
    'escalation_rules',
  ].some((key) => body[key] !== undefined)

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
      api_key_preview: '',
    },
    prompts: promptConfig,
  })
}
