import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import SupportTicketModuleService from '../../../../modules/support-ticket/service'
import { SUPPORT_TICKET_MODULE, TicketStatus } from '../../../../modules/support-ticket'

type UpdateTicketBody = {
  status?: string
}

const VALID_STATUSES = new Set<string>(Object.values(TicketStatus))

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const supportTicketService: SupportTicketModuleService =
    req.scope.resolve(SUPPORT_TICKET_MODULE)

  const result = await supportTicketService.getTicketWithMessages(req.params.id)
  if (!result) {
    return res.status(404).json({ success: false, error: 'Ticket not found' })
  }

  return res.json({ success: true, ...result })
}

export async function PATCH(
  req: MedusaRequest<UpdateTicketBody>,
  res: MedusaResponse,
) {
  const { status } = req.body

  if (status && !VALID_STATUSES.has(status)) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Valid values: ${Object.values(TicketStatus).join(', ')}`,
    })
  }


  const supportTicketService: SupportTicketModuleService =
    req.scope.resolve(SUPPORT_TICKET_MODULE)

  const ticket = await supportTicketService.updateTicket(
    req.params.id,
    {
      status: status as TicketStatus | undefined,
    },
    'admin',
    (req as any).auth_context?.actor_id,
  )
  if (!ticket) {
    return res.status(404).json({ success: false, error: 'Ticket not found' })
  }

  return res.json({ success: true, ticket })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const supportTicketService: SupportTicketModuleService =
    req.scope.resolve(SUPPORT_TICKET_MODULE)

  const deleted = await supportTicketService.deleteTicket(
    req.params.id,
    'admin',
    (req as any).auth_context?.actor_id,
  )
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Ticket not found' })
  }

  return res.json({ success: true, id: deleted.id, deleted: true })
}
