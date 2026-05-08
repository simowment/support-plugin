import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService, requireAdminAuth, ticketNotFound } from '../../../../shared/helpers'

// GET /admin/tickets/:id/notes
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = resolveTicketService(req)
  const notes = await service.listTicketNotes(
    { ticket_id: req.params.id },
    { order: { created_at: 'DESC' } },
  )
  return res.json({ success: true, notes })
}

// POST /admin/tickets/:id/notes
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const adminId = requireAdminAuth(req, res)
  if (!adminId) return

  const { content } = req.body as { content?: string }
  if (!content?.trim()) {
    return res.status(400).json({ success: false, error: 'Note content is required.' })
  }

  const service = resolveTicketService(req)
  const ticket = await service.getTicketWithMessages(req.params.id)
  if (!ticket) return ticketNotFound(res)

  const note = await service.addNote(req.params.id, content.trim(), adminId)
  return res.status(201).json({ success: true, note })
}
