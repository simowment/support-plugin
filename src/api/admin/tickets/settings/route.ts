import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService } from '../../../shared/helpers'
import {
  SUPPORT_TICKET_AI_MODULE,
  AUTO_REPLY_MIN_CONFIDENCE_FLOOR,
  AUTO_REPLY_MIN_CONFIDENCE_KEY,
  BLOCKED_AUTO_REPLY_CATEGORIES,
  CONFIDENCE_THRESHOLD_AUTO_REPLY,
  PROMPT_KEYS,
  PROVIDER_KEYS,
} from '../../../../modules/ai/constants'
import type SupportTicketAIModuleService from '../../../../modules/ai/service'
import type { SupportTicketSettingsBody } from '../../../middlewares'
import { clearTicketAiProblem, TICKET_AI_PROBLEM } from '../../../../lib/ai-health'
import { findOpenStoreProblem } from '../../../../lib/store-problem'

type Source = 'admin' | 'host' | 'default'

async function aiSection(req: AuthenticatedMedusaRequest) {
  if (!req.scope.hasRegistration(SUPPORT_TICKET_AI_MODULE)) return null
  const ai = req.scope.resolve<SupportTicketAIModuleService>(SUPPORT_TICKET_AI_MODULE)
  const [enabled, autoReply, minConfidence, provider, prompts, configured, storedKeys, problem] =
    await Promise.all([
      ai.isEnabled(),
      ai.isAutoReplyEnabled(),
      ai.getAutoReplyMinConfidence(),
      ai.getProviderConfig(),
      ai.getPromptConfig(),
      ai.isProviderConfigured(),
      ai.getStoredSettingKeys(),
      findOpenStoreProblem(req.scope, TICKET_AI_PROBLEM),
    ])
  const stored = new Set(storedKeys)
  const host = ai.getHostAiDefaults()
  const hostHas: Record<string, boolean> = {
    provider: Boolean(host.provider),
    api_key: host.api_key_set,
    model: Boolean(host.model),
    base_url: Boolean(host.base_url),
  }
  const source = (key: string): Source =>
    stored.has(key) ? 'admin' : hostHas[key] ? 'host' : 'default'

  return {
    enabled: { value: enabled, source: source('enabled') },
    auto_reply_enabled: { value: autoReply, source: source('auto_reply_enabled') },
    auto_reply_min_confidence: {
      value: minConfidence,
      source: source(AUTO_REPLY_MIN_CONFIDENCE_KEY),
      default: CONFIDENCE_THRESHOLD_AUTO_REPLY,
      min: AUTO_REPLY_MIN_CONFIDENCE_FLOOR,
    },
    blocked_categories: BLOCKED_AUTO_REPLY_CATEGORIES,
    configured,
    // From the open "AI ticket analysis is failing" Store problem.
    health: {
      failing: Boolean(problem),
      problem_type: TICKET_AI_PROBLEM.type,
      since: problem?.created_at ?? null,
      failure: typeof problem?.context?.failure === 'string' ? problem.context.failure : null,
      ignored: problem?.status === 'ignored',
    },
    provider: {
      provider: provider.provider,
      model: provider.model,
      base_url: provider.base_url,
      has_api_key: Boolean(provider.api_key),
      sources: Object.fromEntries(PROVIDER_KEYS.map((key) => [key, source(key)])),
    },
    prompts: {
      ...prompts,
      sources: Object.fromEntries(PROMPT_KEYS.map((key) => [key, source(key)])),
    },
    host: {
      api_key_set: host.api_key_set,
      model: host.model,
      base_url: host.base_url,
      provider: host.provider,
      extra_headers: host.extra_headers,
      encryption_key_set: host.encryption_key_set,
    },
  }
}

async function readSettings(req: AuthenticatedMedusaRequest) {
  const service = resolveTicketService(req)
  const config = service.getConfig()
  const settings = await service.getSettings()
  return {
    email_customer_replies: settings.email_customer_replies,
    discord_notifications: settings.discord_notifications,
    // Set on the host (`igm shop configure mail` / `provision mail`). Never secret values.
    host: {
      inbound_email_enabled: config.mailgunInboundEnabled,
      inbound_recipients: config.inboundRecipients,
      reply_email_domain: config.replyEmailDomain ?? null,
      mailgun_signing_key_set: Boolean(config.mailgunWebhookSigningKey),
      support_email: config.supportEmail ?? null,
      discord_webhook_set: Boolean(config.discordWebhookUrl),
      email_queue_module: config.emailQueueModule,
      email_queue_registered: req.scope.hasRegistration(config.emailQueueModule),
      shop_slug: config.hostShopSlug,
    },
    setup_help: config.setupHelp,
    ai: await aiSection(req),
  }
}

/**
 * GET /admin/tickets/settings
 *
 * Everything the Support inbox settings page shows: the switches the owner changes here
 * (with where each value comes from) and the state of what is set on the host. Never
 * returns secrets, only whether they are set.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  return res.json(await readSettings(req))
}

/**
 * POST /admin/tickets/settings
 *
 * Saves the switches and the auto-reply confidence. `null` goes back to the default. The
 * AI provider and instructions are saved through POST /admin/tickets/ai-settings.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<SupportTicketSettingsBody>,
  res: MedusaResponse,
) {
  const body = req.validatedBody
  const service = resolveTicketService(req)
  await service.updateSettings({
    email_customer_replies: body.email_customer_replies,
    discord_notifications: body.discord_notifications,
  })

  const aiFields =
    body.ai_enabled !== undefined ||
    body.auto_reply_enabled !== undefined ||
    body.auto_reply_min_confidence !== undefined
  if (aiFields && req.scope.hasRegistration(SUPPORT_TICKET_AI_MODULE)) {
    const ai = req.scope.resolve<SupportTicketAIModuleService>(SUPPORT_TICKET_AI_MODULE)
    if (typeof body.ai_enabled === 'boolean') await ai.setEnabled(body.ai_enabled)
    if (body.ai_enabled === false) {
      await clearTicketAiProblem(
        req.scope,
        'AI suggestions were turned off.',
        req.scope.resolve('logger'),
      )
    }
    if (typeof body.auto_reply_enabled === 'boolean')
      await ai.setAutoReplyEnabled(body.auto_reply_enabled)
    if (body.auto_reply_min_confidence !== undefined)
      await ai.setAutoReplyMinConfidence(body.auto_reply_min_confidence)
  }

  return res.json(await readSettings(req))
}
