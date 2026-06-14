import { SubscriberArgs, type SubscriberConfig } from '@medusajs/framework'
import {
  SUPPORT_TICKET_MODULE,
  TicketEventName,
  type SupportTicketModuleService,
} from '../modules/support-ticket'
import { SUPPORT_TICKET_AI_MODULE } from '../modules/ai/constants'
import SupportTicketAIModuleService from '../modules/ai/service'
import { sendEscalation } from '../utils/escalation-webhook'

type TicketCreatedEventData = {
  id: string
  subject: string
  category: string
  customer_id: string
  order_id: string | null
  message: string
}

type MessageAddedEventData = {
  ticket_id: string
  message_id: string
  sender_type: string
  sender_id: string | null
  message: string
}

export default async function handleAiTicketEvents({
  event: { name, data },
  container,
}: SubscriberArgs<TicketCreatedEventData | MessageAddedEventData>) {
  const logger = container.resolve('logger')
  const aiService: SupportTicketAIModuleService = container.resolve(SUPPORT_TICKET_AI_MODULE)
  const ticketService: SupportTicketModuleService = container.resolve(SUPPORT_TICKET_MODULE)

  if (name === TicketEventName.CREATED) {
    const ticketData = data as TicketCreatedEventData
    try {
      // Guard: skip stale events for tickets that no longer exist (e.g. after test cleanup)
      const [ticketResult, enabled] = await Promise.all([
        ticketService.getTicketWithMessages(ticketData.id),
        aiService.isEnabled(),
      ])

      if (!ticketResult) {
        logger.info(`[support-ticket-ai] Skipping stale event for deleted ticket ${ticketData.id}`)
        return
      }

      if (!enabled) {
        logger.info(
          `[support-ticket-ai] AI is disabled, skipping analysis for ticket ${ticketData.id}`,
        )
        return
      }

      logger.info(`[support-ticket-ai] Analyzing ticket ${ticketData.id}`)

      const analysis = await aiService.analyzeTicket({
        ticketId: ticketData.id,
        subject: ticketData.subject,
        message: ticketData.message,
        category: ticketData.category,
        customerId: ticketData.customer_id,
        orderId: ticketData.order_id,
      })

      const autoReplyEnabled = await aiService.isAutoReplyEnabled()

      if (autoReplyEnabled && aiService.shouldAutoReply(analysis) && analysis.suggested_response) {
        const didMark = await aiService.markAutoReplied(analysis.id)
        if (didMark) {
          await ticketService.addMessage({
            ticketId: ticketData.id,
            message: analysis.suggested_response,
            senderType: 'system',
          })
          logger.info(`[support-ticket-ai] Auto-replied to ticket ${ticketData.id}`)
        }
      }

      const escalation = aiService.getEscalationDecision(analysis)
      if (escalation) {
        logger.warn(
          `[support-ticket-ai] Ticket ${ticketData.id} flagged for escalation: reason=${escalation.reason}`,
        )
        await sendEscalation(
          {
            ticketId: ticketData.id,
            subject: ticketData.subject,
            reason: escalation.reason,
            message: ticketData.message,
          },
          logger,
        )
      }
    } catch (error) {
      logger.error(`[support-ticket-ai] Failed to analyze ticket ${ticketData.id}: ${error}`)
    }
  }

  if (name === TicketEventName.MESSAGE_ADDED) {
    const messageData = data as MessageAddedEventData

    if (messageData.sender_type !== 'customer') {
      return
    }

    try {
      const [enabled, ticketResult, existingAnalysis] = await Promise.all([
        aiService.isEnabled(),
        ticketService.getTicketWithMessages(messageData.ticket_id),
        aiService.getAnalysisForTicket(messageData.ticket_id),
      ])

      if (!enabled) {
        return
      }

      logger.info(`[support-ticket-ai] Deciding action for ticket ${messageData.ticket_id}`)

      if (!ticketResult) {
        logger.warn(
          `[support-ticket-ai] Ticket ${messageData.ticket_id} not found, skipping analysis`,
        )
        return
      }
      const conversationHistory =
        ticketResult.messages
          .filter((message) => message.sender_type !== 'system')
          .map((message) => message.message) ?? []

      await aiService.analyzeMessage({
        ticketId: messageData.ticket_id,
        message: messageData.message,
        senderType: messageData.sender_type,
        conversationHistory,
        existingAnalysis,
      })

      const [updatedAnalysis, autoReplyEnabled] = await Promise.all([
        aiService.getAnalysisForTicket(messageData.ticket_id),
        aiService.isAutoReplyEnabled(),
      ])
      if (
        autoReplyEnabled &&
        updatedAnalysis &&
        aiService.shouldAutoReply(updatedAnalysis) &&
        updatedAnalysis.suggested_response
      ) {
        const didMark = await aiService.markAutoReplied(updatedAnalysis.id)
        if (didMark) {
          await ticketService.addMessage({
            ticketId: messageData.ticket_id,
            message: updatedAnalysis.suggested_response,
            senderType: 'system',
          })
          logger.info(`[support-ticket-ai] Auto-replied to ticket ${messageData.ticket_id}`)
        }
      }

      const escalation = updatedAnalysis
        ? aiService.getEscalationDecision(updatedAnalysis, 'latest_action_decision')
        : null

      if (escalation) {
        logger.warn(
          `[support-ticket-ai] Escalating ticket ${messageData.ticket_id}: reason=${escalation.reason}`,
        )
        await sendEscalation(
          {
            ticketId: messageData.ticket_id,
            subject: ticketResult.ticket.subject,
            reason: escalation.reason,
            message: messageData.message,
          },
          logger,
        )
      }
    } catch (error) {
      logger.error(
        `[support-ticket-ai] Failed to analyze message on ticket ${messageData.ticket_id}: ${error}`,
      )
    }
  }
}

export const config: SubscriberConfig = {
  event: [TicketEventName.CREATED, TicketEventName.MESSAGE_ADDED],
}
