import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import type { SendGuestEmailDraftSchema } from '../../../../../middlewares'
import type { z } from '@medusajs/framework/zod'
import { resolveTicketService, sendError } from '../../../../../shared/helpers'

type Job = { id: string; status: string }
type Body = z.infer<typeof SendGuestEmailDraftSchema>
type Queue = {
  enqueue(input: Record<string, unknown>): Promise<string>
  getJobByIdempotencyKey(key: string): Promise<Job | null>
  getJob(id: string): Promise<Job | null>
}

export async function POST(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  if (req.auth_context.actor_type !== 'user')
    return sendError(
      res,
      403,
      'HUMAN_ADMIN_REQUIRED',
      'A human admin session is required to send email',
    )
  const service = resolveTicketService(req)
  const queueKey = service.getConfig().emailQueueModule
  if (!req.scope.hasRegistration(queueKey))
    return sendError(
      res,
      503,
      'EMAIL_QUEUE_NOT_CONFIGURED',
      'No email queue is registered; guest email replies cannot be sent',
    )
  try {
    let draft = await service.getGuestEmailDraft(req.params.draft_id)
    if (!draft) return sendError(res, 404, 'DRAFT_NOT_FOUND', 'Draft not found')
    draft = await service.freezeGuestEmailDraft(
      req.params.draft_id,
      req.validatedBody.expected_revision,
      req.auth_context.actor_id,
    )
    const queue = req.scope.resolve<Queue>(queueKey)
    let job = await queue.getJobByIdempotencyKey(String(draft.idempotency_key))
    if (!job) {
      if (draft.status !== 'sending')
        return sendError(
          res,
          409,
          'QUEUE_RECONCILIATION_REQUIRED',
          'The original queue record is unavailable; do not send a new copy',
        )
      const payload = draft.frozen_payload as Record<string, unknown>
      const jobId = await queue.enqueue({
        idempotencyKey: String(draft.idempotency_key),
        recipientEmail: String(draft.recipient_email),
        subject: String(draft.subject),
        templateKey: '__inline__',
        payload,
        category: 'transactional',
        metadata: {
          source: 'support-ticket-reply',
          ticket_id: draft.ticket_id,
          draft_id: draft.id,
        },
      })
      job = await queue.getJob(jobId)
    }
    if (!job)
      return sendError(
        res,
        503,
        'QUEUE_RECONCILIATION_REQUIRED',
        'Queue intent exists or may exist; retry this same request to reconcile',
      )
    await service.markGuestEmailDraftQueued(String(draft.id), job.id, job.status)
    return res
      .status(202)
      .json({ draft: { id: draft.id, status: job.status, email_queue_id: job.id } })
  } catch (error) {
    return sendError(
      res,
      409,
      'SEND_RECONCILIATION_REQUIRED',
      error instanceof Error ? error.message : 'Unable to reconcile send',
    )
  }
}
