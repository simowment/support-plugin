import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService } from '../../../shared/helpers'
import { SUPPORT_TICKET_AI_MODULE } from '../../../../modules/ai/constants'
import type SupportTicketAIModuleService from '../../../../modules/ai/service'
import {
  EMAIL_QUEUE_NOT_CONFIGURED_MESSAGE,
  REPLY_DOMAIN_NOT_CONFIGURED_MESSAGE,
} from '../../../../lib/errors'

/**
 * GET /admin/tickets/config
 *
 * What the support inbox can do on this shop, for the admin help strip and to disable
 * controls that cannot work. Never returns secrets.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = resolveTicketService(req)
  const config = service.getConfig()
  const queueRegistered = req.scope.hasRegistration(config.emailQueueModule)
  const replyDomain = service.hasReplyDomain()

  let ai = { enabled: false, configured: false, auto_reply_enabled: false }
  if (req.scope.hasRegistration(SUPPORT_TICKET_AI_MODULE)) {
    const aiService = req.scope.resolve<SupportTicketAIModuleService>(SUPPORT_TICKET_AI_MODULE)
    const [enabled, configured, autoReply] = await Promise.all([
      aiService.isEnabled(),
      aiService.isProviderConfigured(),
      aiService.isAutoReplyEnabled(),
    ])
    ai = { enabled, configured, auto_reply_enabled: autoReply }
  }

  const noQueue = EMAIL_QUEUE_NOT_CONFIGURED_MESSAGE

  return res.json({
    inbound_email: {
      enabled: config.mailgunInboundEnabled,
      recipients: config.inboundRecipients,
    },
    customer_replies: {
      email_enabled: config.emailCustomerReplies,
      can_send: queueRegistered && config.emailCustomerReplies,
      reply_to: replyDomain ? 'ticket' : config.supportEmail ? 'support_mailbox' : 'store_sender',
      reason: !queueRegistered
        ? noQueue
        : !config.emailCustomerReplies
          ? 'Emailing replies to customers is turned off in the plugin options.'
          : null,
    },
    guest_replies: {
      can_send: queueRegistered && replyDomain,
      reason: !queueRegistered
        ? noQueue
        : !replyDomain
          ? REPLY_DOMAIN_NOT_CONFIGURED_MESSAGE
          : null,
    },
    ai,
    discord_notifications: Boolean(config.discordWebhookUrl),
  })
}
