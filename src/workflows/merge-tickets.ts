import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from '@medusajs/framework/workflows-sdk'
import { MedusaError } from '@medusajs/framework/utils'
import { SUPPORT_TICKET_MODULE, type TicketStatus } from '../modules/support-ticket'
import type SupportTicketModuleService from '../modules/support-ticket/service'

export type MergeTicketsWorkflowInput = {
  sourceTicketId: string
  targetTicketId: string
  performedByType?: string
  performedById?: string
}

type MergeTicketsOutput = {
  source_ticket_id: string
  target_ticket_id: string
}

type MergeTicketsCompensation = {
  sourceTicketId: string
  targetTicketId: string
  messageIds: string[]
  noteIds: string[]
  sourceStatus: string
  sourceClosedAt: Date | null
  sourceMetadata: Record<string, unknown>
  targetMetadata: Record<string, unknown>
  performedByType?: string
  performedById?: string
}

const MAX_ROWS_MOVED = 1000

/**
 * Merge one ticket into another.
 *
 * `mergeTickets` moves messages and notes, closes the source and stamps both
 * metadata records. That is four writes with no undo, so the step records what
 * it moved and the compensation puts it back: rows return to the source, the
 * source reopens, and both metadata snapshots are restored.
 */
const mergeTicketsStep = createStep(
  'merge-support-tickets',
  async (input: MergeTicketsWorkflowInput, { container }) => {
    const service = container.resolve<SupportTicketModuleService>(SUPPORT_TICKET_MODULE)

    const [source, target] = await Promise.all([
      service.getTicketById(input.sourceTicketId),
      service.getTicketById(input.targetTicketId),
    ])
    if (!source || !target) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Both tickets must exist. source=${Boolean(source)} target=${Boolean(target)}`,
      )
    }

    const [messages, notes] = await Promise.all([
      service.listTicketMessages({ ticket: source.id }, { take: MAX_ROWS_MOVED }),
      service.listTicketNotes({ ticket: source.id }, { take: MAX_ROWS_MOVED }),
    ])

    const result = await service.mergeTickets(
      source.id,
      target.id,
      input.performedByType,
      input.performedById,
    )

    return new StepResponse<MergeTicketsOutput, MergeTicketsCompensation>(result, {
      sourceTicketId: source.id,
      targetTicketId: target.id,
      messageIds: messages.map((message) => message.id),
      noteIds: notes.map((note) => note.id),
      sourceStatus: source.status,
      sourceClosedAt: source.closed_at,
      sourceMetadata: (source.metadata as Record<string, unknown> | null) ?? {},
      targetMetadata: (target.metadata as Record<string, unknown> | null) ?? {},
      performedByType: input.performedByType,
      performedById: input.performedById,
    })
  },
  async (compensation: MergeTicketsCompensation | undefined, { container }) => {
    if (!compensation) return

    const service = container.resolve<SupportTicketModuleService>(SUPPORT_TICKET_MODULE)

    if (compensation.messageIds.length > 0) {
      await service.updateTicketMessages(
        compensation.messageIds.map((id) => ({ id, ticket: compensation.sourceTicketId })),
      )
    }
    if (compensation.noteIds.length > 0) {
      await service.updateTicketNotes(
        compensation.noteIds.map((id) => ({ id, ticket: compensation.sourceTicketId })),
      )
    }

    await service.updateTickets([
      {
        id: compensation.sourceTicketId,
        status: compensation.sourceStatus as TicketStatus,
        closed_at: compensation.sourceClosedAt,
        metadata: compensation.sourceMetadata,
      },
      {
        id: compensation.targetTicketId,
        metadata: compensation.targetMetadata,
      },
    ])
  },
)

export const mergeTicketsWorkflow = createWorkflow(
  'merge-support-tickets',
  (input: MergeTicketsWorkflowInput) => {
    return new WorkflowResponse(mergeTicketsStep(input))
  },
)
