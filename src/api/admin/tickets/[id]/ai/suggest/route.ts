import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { MedusaError } from '@medusajs/framework/utils'
import {
  SUPPORT_TICKET_MODULE,
  type SupportTicketModuleService,
} from '../../../../../../modules/support-ticket'
import SupportTicketAIModuleService from '../../../../../../modules/ai/service'
import {
  SUPPORT_TICKET_AI_MODULE,
  MAX_HISTORY_MESSAGES,
} from '../../../../../../modules/ai/constants'
import { requireAdminAuth } from '../../../../../shared/helpers'

// POST /admin/tickets/:id/ai/suggest — Generate a suggested AI response for a ticket
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const adminId = requireAdminAuth(req, res)
  if (!adminId) return

  const { id } = req.params
  const aiService: SupportTicketAIModuleService = req.scope.resolve(SUPPORT_TICKET_AI_MODULE)

  const analysis = await aiService.getAnalysisForTicket(id)

  if (!analysis) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      'No AI analysis found. Ticket must be analyzed first.',
    )
  }

  const ticketService = req.scope.resolve(SUPPORT_TICKET_MODULE) as SupportTicketModuleService
  const ticketData = await ticketService.getTicketWithMessages(id)

  if (!ticketData) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, 'Ticket not found')
  }

  const latestCustomerMessage = [...ticketData.messages]
    .reverse()
    .find((m) => m.sender_type === 'customer')

  const conversationHistory = ticketData.messages
    .filter((m) => m.sender_type !== 'system')
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => m.message)

  const provider = await aiService.getProvider()
  const prompts = await aiService.getPromptConfig()
  const result = await provider.generateResponse({
    subject: ticketData.ticket.subject,
    message: latestCustomerMessage?.message ?? '',
    conversationHistory,
    category: analysis.category ?? 'general',
    systemPrompt: prompts.response_system_prompt || undefined,
  })

  await aiService.updateAITicketAnalyses([
    {
      id: analysis.id,
      suggested_response: result.message,
      response_confidence: result.confidence,
    },
  ])

  return res.json({
    suggested_response: result.message,
    confidence: result.confidence,
  })
}
