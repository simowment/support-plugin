import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService, sendError, ticketNotFound } from '../../../../shared/helpers'
import type { GuestEmailDraftSchema } from '../../../../middlewares'
import type { z } from '@medusajs/framework/zod'

type Body = z.infer<typeof GuestEmailDraftSchema>

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = resolveTicketService(req)
  const ticket = await service.getTicketWithMessages(req.params.id)
  if (!ticket) return ticketNotFound(res)
  if (ticket.ticket.customer_id)
    return sendError(
      res,
      400,
      'NOT_GUEST_TICKET',
      'Email drafts are only available for guest tickets',
    )
  const drafts = await service.listGuestEmailDrafts(req.params.id)
  const queue = req.scope.resolve<{ getJob(id: string): Promise<{ status: string } | null> }>(
    'emailQueue',
  )
  const withDelivery = await Promise.all(
    drafts.map(async (draft) => ({
      ...draft,
      delivery_status: draft.email_queue_id
        ? ((await queue.getJob(String(draft.email_queue_id)))?.status ?? draft.status)
        : draft.status,
    })),
  )
  return res.json({ drafts: withDelivery })
}

export async function POST(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  const service = resolveTicketService(req)
  try {
    const draft = await service.saveGuestEmailDraft(
      req.params.id,
      req.validatedBody.body,
      req.validatedBody.draft_id,
      req.validatedBody.client_id,
      req.validatedBody.expected_revision,
    )
    return res.status(req.validatedBody.draft_id ? 200 : 201).json({ draft })
  } catch (error) {
    return sendError(
      res,
      400,
      'DRAFT_REJECTED',
      error instanceof Error ? error.message : 'Draft rejected',
    )
  }
}
