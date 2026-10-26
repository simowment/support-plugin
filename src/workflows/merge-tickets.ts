import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from '@medusajs/framework/workflows-sdk'
import { ContainerRegistrationKeys, MedusaError } from '@medusajs/framework/utils'
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
 * Undo a merge: rows return to the source, the source reopens, and both
 * metadata snapshots are restored.
 */
async function restoreMerge(
  service: SupportTicketModuleService,
  snapshot: MergeTicketsCompensation,
) {
  if (snapshot.messageIds.length > 0) {
    await service.updateTicketMessages(
      snapshot.messageIds.map((id) => ({ id, ticket_id: snapshot.sourceTicketId })),
    )
  }
  if (snapshot.noteIds.length > 0) {
    await service.updateTicketNotes(
      snapshot.noteIds.map((id) => ({ id, ticket_id: snapshot.sourceTicketId })),
    )
  }

  await service.updateTickets([
    {
      id: snapshot.sourceTicketId,
      status: snapshot.sourceStatus as TicketStatus,
      closed_at: snapshot.sourceClosedAt,
      metadata: snapshot.sourceMetadata,
    },
    {
      id: snapshot.targetTicketId,
      metadata: snapshot.targetMetadata,
    },
  ])
}

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

    const snapshot: MergeTicketsCompensation = {
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
    }

    try {
      const result = await service.mergeTickets(
        source.id,
        target.id,
        input.performedByType,
        input.performedById,
      )
      return new StepResponse<MergeTicketsOutput, MergeTicketsCompensation>(result, snapshot)
    } catch (error) {
      // mergeTickets writes in sequence, so a throw part-way leaves rows moved.
      // The engine only compensates steps that returned, so undo it here.
      const logger = container.resolve<{ error: (message: string) => void }>(
        ContainerRegistrationKeys.LOGGER,
      )
      await restoreMerge(service, snapshot).catch((restoreError) => {
        logger.error(
          `[support-tickets] Failed to undo a partial merge of ${source.id} into ${target.id}: ${
            (restoreError as Error).message
          }`,
        )
      })
      throw error
    }
  },
  async (compensation: MergeTicketsCompensation | undefined, { container }) => {
    if (!compensation) return

    const service = container.resolve<SupportTicketModuleService>(SUPPORT_TICKET_MODULE)
    await restoreMerge(service, compensation)
  },
)

export const mergeTicketsWorkflow = createWorkflow(
  'merge-support-tickets',
  (input: MergeTicketsWorkflowInput) => {
    return new WorkflowResponse(mergeTicketsStep(input))
  },
)
