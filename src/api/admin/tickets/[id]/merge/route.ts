import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { sendError, getErrorMessage } from '../../../../shared/helpers'
import { mergeTicketsWorkflow } from '../../../../../workflows'
import type { MergeTicketBody } from '../../../../middlewares'

export async function POST(req: AuthenticatedMedusaRequest<MergeTicketBody>, res: MedusaResponse) {
  const adminId = req.auth_context.actor_id

  const { source_ticket_id: sourceTicketId } = req.validatedBody
  const targetTicketId = req.params.id

  try {
    const { result } = await mergeTicketsWorkflow(req.scope).run({
      input: {
        sourceTicketId,
        targetTicketId,
        performedByType: 'admin',
        performedById: adminId,
      },
    })

    return res.json({ success: true, ...result })
  } catch (error: unknown) {
    return sendError(res, 400, 'MERGE_FAILED', getErrorMessage(error))
  }
}
