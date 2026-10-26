import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from '@medusajs/framework/workflows-sdk'
import { SUPPORT_TICKET_MODULE, type TicketStatus } from '../modules/support-ticket'
import type SupportTicketModuleService from '../modules/support-ticket/service'

/**
 * Bulk status/assignee change.
 *
 * The whole batch is one step so a failure part-way through compensates the
 * rows that were already written. The previous route-level loop left a partial
 * update behind and reported nothing about it.
 */
export type BulkUpdateTicketsWorkflowInput = {
  ticketIds: string[]
  /** `null` leaves the status untouched. */
  status: TicketStatus | null
  assignedTo: string | null
  setAssignment: boolean
  performedByType?: string
  performedById?: string
}

type BulkUpdateCompensation = {
  updated: Array<{ ticketId: string; status: string; assignedTo: string | null }>
  performedByType?: string
  performedById?: string
}

export type BulkUpdateTicketsOutput = {
  tickets: unknown[]
  notFoundIds: string[]
}

const bulkUpdateTicketsStep = createStep(
  'bulk-update-support-tickets',
  async (input: BulkUpdateTicketsWorkflowInput, { container }) => {
    const service = container.resolve<SupportTicketModuleService>(SUPPORT_TICKET_MODULE)

    const tickets: unknown[] = []
    const notFoundIds: string[] = []
    const updated: BulkUpdateCompensation['updated'] = []

    for (const ticketId of input.ticketIds) {
      const current = await service.getTicketById(ticketId)
      if (!current) {
        notFoundIds.push(ticketId)
        continue
      }

      const patch: { status?: TicketStatus; assignedTo?: string | null } = {}
      if (input.status) patch.status = input.status
      if (input.setAssignment) patch.assignedTo = input.assignedTo

      const ticket = await service.updateTicket(
        ticketId,
        patch,
        input.performedByType,
        input.performedById,
      )
      if (!ticket) {
        notFoundIds.push(ticketId)
        continue
      }

      tickets.push(ticket)
      updated.push({ ticketId, status: current.status, assignedTo: current.assigned_to })
    }

    return new StepResponse<BulkUpdateTicketsOutput, BulkUpdateCompensation>(
      { tickets, notFoundIds },
      {
        updated,
        performedByType: input.performedByType,
        performedById: input.performedById,
      },
    )
  },
  async (compensation: BulkUpdateCompensation | undefined, { container }) => {
    if (!compensation || compensation.updated.length === 0) return

    const service = container.resolve<SupportTicketModuleService>(SUPPORT_TICKET_MODULE)
    for (const row of compensation.updated) {
      await service.updateTicket(
        row.ticketId,
        { status: row.status as TicketStatus, assignedTo: row.assignedTo },
        compensation.performedByType,
        compensation.performedById,
      )
    }
  },
)

export const bulkUpdateTicketsWorkflow = createWorkflow(
  'bulk-update-support-tickets',
  (input: BulkUpdateTicketsWorkflowInput) => {
    return new WorkflowResponse(bulkUpdateTicketsStep(input))
  },
)
