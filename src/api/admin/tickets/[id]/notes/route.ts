import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService, ticketNotFound } from '../../../../shared/helpers'
import type { TicketNoteBody } from '../../../../middlewares'

// GET /admin/tickets/:id/notes
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = resolveTicketService(req)
  const notes = await service.listTicketNotes(
    { ticket: req.params.id },
    { order: { created_at: 'DESC' } },
  )
  return res.json({ success: true, notes })
}

// POST /admin/tickets/:id/notes
export async function POST(req: AuthenticatedMedusaRequest<TicketNoteBody>, res: MedusaResponse) {
  const adminId = req.auth_context.actor_id

  const { content } = req.validatedBody

  const service = resolveTicketService(req)
  const ticket = await service.getTicketWithMessages(req.params.id)
  if (!ticket) return ticketNotFound(res)

  const note = await service.addNote(req.params.id, content, adminId)
  return res.status(201).json({ success: true, note })
}
