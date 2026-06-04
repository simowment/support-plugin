import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { MedusaError } from '@medusajs/framework/utils'
import {
  SUPPORT_TICKET_MODULE,
  type SupportTicketModuleService,
} from '../../../../../modules/support-ticket'
import SupportTicketAIModuleService from '../../../../../modules/ai/service'
import { SUPPORT_TICKET_AI_MODULE } from '../../../../../modules/ai/constants'
import { sendEscalation } from '../../../../../utils/escalation-webhook'

type TicketRecord = {
  subject: string
  category: string
  customer_id?: string | null
  order_id?: string | null
}

type TicketMessageRecord = {
  sender_type: string
  message: string
}

// GET /admin/tickets/:id/ai — Get AI analysis for a ticket
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const aiService: SupportTicketAIModuleService = req.scope.resolve(SUPPORT_TICKET_AI_MODULE)

  const analysis = await aiService.getAnalysisForTicket(id)

  if (!analysis) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, 'No AI analysis found for this ticket')
  }

  return res.json({ analysis })
}

// POST /admin/tickets/:id/ai — Analyze a ticket now with the configured AI provider
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const logger = req.scope.resolve('logger')
  const aiService: SupportTicketAIModuleService = req.scope.resolve(SUPPORT_TICKET_AI_MODULE)
  const providerConfig = await aiService.getProviderConfig()

  const existingAnalysis = await aiService.getAnalysisForTicket(id)
  if (existingAnalysis) {
    return res.json({ analysis: existingAnalysis })
  }

  const ticketService = req.scope.resolve(SUPPORT_TICKET_MODULE) as SupportTicketModuleService
  const ticketData = await ticketService.getTicketWithMessages(id)

  if (!ticketData) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, 'Ticket not found')
  }

  const ticket = ticketData.ticket as TicketRecord
  const firstCustomerMessage = (ticketData.messages as TicketMessageRecord[]).find(
    (message) => message.sender_type === 'customer',
  )

  if (!firstCustomerMessage?.message) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'Ticket has no customer message to analyze.',
    )
  }

  try {
    logger.info(
      `[support-ticket-ai] Running manual analysis for ticket ${id} ` +
        `provider=${providerConfig.provider} model=${providerConfig.model} base_url=${providerConfig.base_url} ` +
        `has_api_key=${Boolean(providerConfig.api_key)}`,
    )

    const analysis = await aiService.analyzeTicket({
      ticketId: id,
      subject: ticket.subject,
      message: firstCustomerMessage.message,
      category: ticket.category,
      customerId: ticket.customer_id,
      orderId: ticket.order_id,
    })

    const autoReplyEnabled = await aiService.isAutoReplyEnabled()
    if (autoReplyEnabled && aiService.shouldAutoReply(analysis) && analysis.suggested_response) {
      const didMark = await aiService.markAutoReplied(analysis.id)
      if (didMark) {
        await ticketService.addMessage({
          ticketId: id,
          message: analysis.suggested_response,
          senderType: 'system',
        })
      }
    }

    const escalation = aiService.getEscalationDecision(analysis)
    if (escalation) {
      await sendEscalation(
        {
          ticketId: id,
          subject: ticket.subject,
          reason: escalation.reason,
          message: firstCustomerMessage.message,
        },
        logger,
      )
    }

    return res.status(201).json({ analysis })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      `[support-ticket-ai] Ticket analysis failed for ${id} ` +
        `provider=${providerConfig.provider} model=${providerConfig.model} base_url=${providerConfig.base_url}: ${message}`,
    )
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `AI ticket analysis failed: ${message}`)
  }
}
