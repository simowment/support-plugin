import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import SupportTicketModuleService from '../../../../modules/support-ticket/service'
import { SUPPORT_TICKET_MODULE, TicketStatus, TicketPriority } from '../../../../modules/support-ticket'

type UpdateTicketBody = {
  status?: string
  priority?: string
}

const VALID_STATUSES = new Set<string>(Object.values(TicketStatus))
const VALID_PRIORITIES = new Set<string>(Object.values(TicketPriority))

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const supportTicketService: SupportTicketModuleService =
    req.scope.resolve(SUPPORT_TICKET_MODULE)

  const result = await supportTicketService.getTicketWithMessages(req.params.id)
  if (!result) {
    return res.status(404).json({ message: 'Ticket not found' })
  }

  return res.json(result)
}

export async function PATCH(
  req: MedusaRequest<UpdateTicketBody>,
  res: MedusaResponse,
) {
  const { status, priority } = req.body

  if (status && !VALID_STATUSES.has(status)) {
    return res.status(400).json({
      message: `Invalid status. Valid values: ${Object.values(TicketStatus).join(', ')}`,
    })
  }
  if (priority && !VALID_PRIORITIES.has(priority)) {
    return res.status(400).json({
      message: `Invalid priority. Valid values: ${Object.values(TicketPriority).join(', ')}`,
    })
  }

  const supportTicketService: SupportTicketModuleService =
    req.scope.resolve(SUPPORT_TICKET_MODULE)

  const ticket = await supportTicketService.updateTicket(
    req.params.id,
    {
      status: status as TicketStatus | undefined,
      priority: priority as TicketPriority | undefined,
    },
    'admin',
    (req as any).auth_context?.actor_id,
  )
  if (!ticket) {
    return res.status(404).json({ message: 'Ticket not found' })
  }

  return res.json({ ticket })
}
