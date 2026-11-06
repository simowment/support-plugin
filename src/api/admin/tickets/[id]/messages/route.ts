import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import {
  resolveTicketService,
  ticketNotFound,
  sanitize,
  sendError,
} from '../../../../shared/helpers'
import { SenderType } from '../../../../../modules/support-ticket'
import type { MessageBody } from '../../../../middlewares'
import { attachTicketAttachmentUrls } from '../../../../shared/attachments'
import {
  EMAIL_QUEUE_NOT_CONFIGURED_MESSAGE,
  GUEST_TICKET_USE_EMAIL_DRAFT_MESSAGE,
} from '../../../../../lib/errors'

/**
 * POST /admin/tickets/:id/messages
 *
 * Reply as admin to a signed-in customer's ticket. The `ticket-reply-email` subscriber
 * emails the reply; `email` in the response says whether it will (so the caller does not
 * assume the customer was answered when mail is not set up).
 *
 * Guest tickets are refused with `409 GUEST_TICKET_USE_EMAIL_DRAFT`: a guest has no account
 * and is only reachable through the reviewed email draft flow.
 */
export async function POST(req: AuthenticatedMedusaRequest<MessageBody>, res: MedusaResponse) {
  const adminId = req.auth_context.actor_id

  const { message, attachments } = req.validatedBody

  const cleanMessage = message ? sanitize(message) : ''
  if (!cleanMessage && !attachments?.length)
    return sendError(res, 400, 'VALIDATION', 'Message or attachments are required.')

  const service = resolveTicketService(req)
  const result = await service.getTicketWithMessages(req.params.id)
  if (!result) return ticketNotFound(res)

  if (!result.ticket.customer_id)
    return sendError(res, 409, 'GUEST_TICKET_USE_EMAIL_DRAFT', GUEST_TICKET_USE_EMAIL_DRAFT_MESSAGE)

  const config = service.getConfig()
  const queueRegistered = req.scope.hasRegistration(config.emailQueueModule)
  const email = !config.emailCustomerReplies
    ? {
        will_send: false,
        reason: 'Emailing replies to customers is turned off in the plugin options.',
      }
    : !queueRegistered
      ? { will_send: false, reason: EMAIL_QUEUE_NOT_CONFIGURED_MESSAGE }
      : { will_send: true, reason: null }

  const msg = await service.addMessage({
    ticketId: req.params.id,
    message: cleanMessage,
    senderType: SenderType.ADMIN,
    senderId: adminId,
    attachments: attachTicketAttachmentUrls(req.params.id, attachments),
  })

  return res.status(201).json({ success: true, message: msg, email })
}
