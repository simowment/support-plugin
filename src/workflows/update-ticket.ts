import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from '@medusajs/framework/workflows-sdk'
import { MedusaError } from '@medusajs/framework/utils'
import { SUPPORT_TICKET_MODULE, type TicketStatus } from '../modules/support-ticket'
import type SupportTicketModuleService from '../modules/support-ticket/service'

/**
 * Ticket status/assignee change.
 *
 * `setAssignment` exists because the patch has two independent optional fields
 * and `assignedTo: null` is a real value (unassign), not "leave it alone".
 * Workflow input must survive serialization, so the intent is carried by a
 * boolean instead of by an absent key.
 */
export type UpdateTicketWorkflowInput = {
  ticketId: string
  /** `null` leaves the status untouched. */
  status: TicketStatus | null
  assignedTo: string | null
  setAssignment: boolean
  performedByType?: string
  performedById?: string
}

type UpdateTicketCompensation = {
  ticketId: string
  status: string
  assignedTo: string | null
  performedByType?: string
  performedById?: string
}

const updateTicketStep = createStep(
  'update-support-ticket',
  async (input: UpdateTicketWorkflowInput, { container }) => {
    const service = container.resolve<SupportTicketModuleService>(SUPPORT_TICKET_MODULE)

    const current = await service.getTicketById(input.ticketId)
    if (!current) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Ticket ${input.ticketId} not found`)
    }

    const patch: { status?: TicketStatus; assignedTo?: string | null } = {}
    if (input.status) patch.status = input.status
    if (input.setAssignment) patch.assignedTo = input.assignedTo

    const ticket = await service.updateTicket(
      input.ticketId,
      patch,
      input.performedByType,
      input.performedById,
    )

    return new StepResponse(ticket, {
      ticketId: input.ticketId,
      status: current.status,
      assignedTo: current.assigned_to,
      performedByType: input.performedByType,
      performedById: input.performedById,
    })
  },
  async (compensation: UpdateTicketCompensation | undefined, { container }) => {
    if (!compensation) return

    const service = container.resolve<SupportTicketModuleService>(SUPPORT_TICKET_MODULE)
    await service.updateTicket(
      compensation.ticketId,
      {
        status: compensation.status as TicketStatus,
        assignedTo: compensation.assignedTo,
      },
      compensation.performedByType,
      compensation.performedById,
    )
  },
)

export const updateTicketWorkflow = createWorkflow(
  'update-support-ticket',
  (input: UpdateTicketWorkflowInput) => {
    return new WorkflowResponse(updateTicketStep(input))
  },
)
