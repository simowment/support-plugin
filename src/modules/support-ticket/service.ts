import { MedusaService, Modules } from '@medusajs/framework/utils'
import type { Logger } from '@medusajs/framework/types'
import { Ticket } from './models/ticket'
import { TicketMessage } from './models/ticket-message'
import { TicketEvent } from './models/ticket-event'
import { TicketNote } from './models/ticket-note'
import {
  TicketStatus,
  TicketEventType,
  TicketEventName,
  type TicketCategory,
  type SenderType,
  SenderType as SenderTypeValues,
} from './constants'

type TicketRecord = {
  id: string
  subject: string
  category: string
  status: string
  customer_id: string
  assigned_to: string | null
  order_id: string | null
  closed_at: Date | null
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
}

type CreateTicketInput = {
  subject: string
  category: TicketCategory
  customerId: string
  orderId?: string
  message: string
  metadata?: Record<string, unknown>
}

type AddMessageInput = {
  ticketId: string
  message: string
  senderType: SenderType
  senderId?: string
  attachments?: Record<string, unknown>[]
}

type UpdateTicketInput = {
  status?: TicketStatus
  assignedTo?: string | null
}

type PaginationParams = {
  take?: number
  skip?: number
}

const UNREAD_REPLY_TICKET_LIMIT = 1000
const UNREAD_REPLY_EVENT_LIMIT = 5000

type TicketEventData = {
  ticket: string
  event_type: string
  data: Record<string, unknown> | null
  performed_by_type: string | null
  performed_by_id: string | null
}

export default class SupportTicketModuleService extends MedusaService({
  Ticket,
  TicketMessage,
  TicketEvent,
  TicketNote,
}) {
  protected eventBusService_: any
  private logger_: Logger

  constructor(container: Record<string, unknown> & { logger?: Logger }) {
    super(...arguments)
    this.eventBusService_ = container[Modules.EVENT_BUS]
    this.logger_ = container.logger ?? (console as unknown as Logger)
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async getTicketById(ticketId: string): Promise<TicketRecord | null> {
    const [ticket] = await this.listTickets({ id: ticketId }, { take: 1 })
    return (ticket as TicketRecord) ?? null
  }

  private buildEvent(
    ticketId: string,
    eventType: string,
    data: Record<string, unknown> | null,
    performedByType?: string | null,
    performedById?: string | null,
  ): TicketEventData {
    return {
      ticket: ticketId,
      event_type: eventType,
      data,
      performed_by_type: performedByType ?? null,
      performed_by_id: performedById ?? null,
    }
  }

  private async emitAndPersistEvents(
    ticketId: string,
    events: TicketEventData[],
    eventName?: string,
    eventBusData?: Record<string, unknown>,
  ): Promise<void> {
    if (events.length > 0) {
      await this.createTicketEvents(events)
    }
    if (eventName && this.eventBusService_) {
      await this.eventBusService_.emit({ name: eventName, data: eventBusData ?? { id: ticketId } })
    }
  }

  private warnAddMessageSideEffect(action: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.logger_.warn(`[Support Tickets] addMessage ${action} failed: ${message}`)
  }

  // ── Ticket CRUD ──────────────────────────────────────────────────

  async createTicket(input: CreateTicketInput): Promise<TicketRecord> {
    const [ticket] = await this.createTickets([
      {
        subject: input.subject,
        category: input.category,
        status: TicketStatus.OPEN,
        customer_id: input.customerId,
        order_id: input.orderId ?? null,
        metadata: input.metadata ?? null,
      },
    ])

    await this.createTicketMessages([
      {
        ticket: ticket.id,
        sender_type: SenderTypeValues.CUSTOMER,
        sender_id: input.customerId,
        message: input.message,
        attachments: null,
      },
    ])

    await this.emitAndPersistEvents(
      ticket.id,
      [
        this.buildEvent(
          ticket.id,
          TicketEventType.TICKET_CREATED,
          { category: input.category },
          SenderTypeValues.CUSTOMER,
          input.customerId,
        ),
      ],
      TicketEventName.CREATED,
      {
        id: ticket.id,
        subject: input.subject,
        category: input.category,
        customer_id: input.customerId,
        order_id: input.orderId ?? null,
        message: input.message,
      },
    )

    return ticket as unknown as TicketRecord
  }

  async addMessage(input: AddMessageInput) {
    const currentTicket = await this.getTicketById(input.ticketId)
    if (!currentTicket) {
      throw new Error(`Ticket ${input.ticketId} not found`)
    }

    const isClosed = currentTicket.status === TicketStatus.CLOSED

    // 1. Create message FIRST (critical data — must persist)
    const [message] = await this.createTicketMessages([
      {
        ticket: input.ticketId,
        sender_type: input.senderType,
        sender_id: input.senderId ?? null,
        message: input.message,
        attachments: input.attachments ? { items: input.attachments } : null,
      },
    ])

    // 2. Reopen ticket if closed (non-critical — guarded)
    if (isClosed) {
      try {
        await this.updateTickets([
          { id: input.ticketId, status: TicketStatus.OPEN, closed_at: null },
        ])
      } catch (error) {
        this.warnAddMessageSideEffect('reopen ticket update', error)
      }
      try {
        await this.createTicketEvents([
          this.buildEvent(
            input.ticketId,
            TicketEventType.TICKET_REOPENED,
            { reason: 'message_received', sender_type: input.senderType },
            input.senderType,
            input.senderId,
          ),
        ])
      } catch (error) {
        this.warnAddMessageSideEffect('reopen event creation', error)
      }
    }

    // 3. Create message event (non-critical — guarded)
    try {
      await this.createTicketEvents([
        this.buildEvent(
          input.ticketId,
          TicketEventType.MESSAGE_ADDED,
          { sender_type: input.senderType },
          input.senderType,
          input.senderId,
        ),
      ])
    } catch (error) {
      this.warnAddMessageSideEffect('message event creation', error)
    }

    // 4. Update status (non-critical — guarded)
    if (input.senderType !== SenderTypeValues.SYSTEM) {
      const effectiveStatus = isClosed ? TicketStatus.OPEN : currentTicket.status
      try {
        if (
          input.senderType === SenderTypeValues.CUSTOMER &&
          effectiveStatus !== TicketStatus.OPEN
        ) {
          await this.updateTickets([{ id: input.ticketId, status: TicketStatus.WAITING_ADMIN }])
        } else if (input.senderType === SenderTypeValues.ADMIN) {
          await this.updateTickets([{ id: input.ticketId, status: TicketStatus.WAITING_CUSTOMER }])
        }
      } catch (error) {
        this.warnAddMessageSideEffect('status update', error)
      }
    }

    // 5. Emit event bus LAST (external side effect, after DB is consistent)
    try {
      await this.eventBusService_?.emit({
        name: TicketEventName.MESSAGE_ADDED,
        data: {
          ticket_id: input.ticketId,
          message_id: (message as { id: string }).id,
          sender_type: input.senderType,
          sender_id: input.senderId ?? null,
          message: input.message,
        },
      })
    } catch (error) {
      this.warnAddMessageSideEffect('event bus emit', error)
    }

    return message
  }

  async updateTicket(
    ticketId: string,
    input: UpdateTicketInput,
    performedByType?: string,
    performedById?: string,
  ) {
    const currentTicket = await this.getTicketById(ticketId)
    if (!currentTicket) {
      return null
    }

    const updates: Record<string, unknown> = { id: ticketId }
    const events: TicketEventData[] = []

    if (input.status !== undefined) {
      const oldStatus = currentTicket.status
      updates.status = input.status
      const wasClosed = oldStatus === TicketStatus.CLOSED
      const isNowClosed = input.status === TicketStatus.CLOSED

      if (wasClosed && !isNowClosed) {
        updates.closed_at = null
      }

      if (isNowClosed) {
        updates.closed_at = new Date()
        events.push(
          this.buildEvent(
            ticketId,
            TicketEventType.TICKET_CLOSED,
            { old_status: oldStatus },
            performedByType,
            performedById,
          ),
        )
      } else if (wasClosed) {
        events.push(
          this.buildEvent(
            ticketId,
            TicketEventType.TICKET_REOPENED,
            { old_status: oldStatus, new_status: input.status },
            performedByType,
            performedById,
          ),
        )
      } else {
        events.push(
          this.buildEvent(
            ticketId,
            TicketEventType.STATUS_CHANGED,
            { old_status: oldStatus, new_status: input.status },
            performedByType,
            performedById,
          ),
        )
      }
    }

    if (input.assignedTo !== undefined && input.assignedTo !== currentTicket.assigned_to) {
      updates.assigned_to = input.assignedTo
      events.push(
        this.buildEvent(
          ticketId,
          input.assignedTo ? TicketEventType.ASSIGNED : TicketEventType.UNASSIGNED,
          { old_assigned_to: currentTicket.assigned_to, new_assigned_to: input.assignedTo },
          performedByType,
          performedById,
        ),
      )
    }

    const [updated] = await this.updateTickets([updates])
    await this.emitAndPersistEvents(ticketId, events, TicketEventName.UPDATED, {
      id: ticketId,
      ...input,
    })
    return updated
  }

  async deleteTicket(ticketId: string, performedByType?: string, performedById?: string) {
    const ticket = await this.getTicketById(ticketId)
    if (!ticket) {
      return null
    }

    await this.deleteTicketMessages({ ticket: ticketId })
    await this.deleteTicketNotes({ ticket_id: ticketId })
    await this.deleteTicketEvents({ ticket: ticketId })
    await this.deleteTickets({ id: ticketId })

    await this.eventBusService_?.emit({
      name: TicketEventName.DELETED,
      data: {
        id: ticketId,
        performed_by_type: performedByType ?? null,
        performed_by_id: performedById ?? null,
      },
    })

    return { id: ticketId }
  }

  async listCustomerTickets(
    customerId: string,
    filters?: { status?: string },
    pagination?: PaginationParams,
  ) {
    const queryFilters: Record<string, unknown> = { customer_id: customerId }
    if (filters?.status) queryFilters.status = filters.status

    return this.listTickets(queryFilters, {
      order: { created_at: 'DESC' },
      take: pagination?.take ?? 50,
      skip: pagination?.skip ?? 0,
    })
  }

  async getTicketWithMessages(ticketId: string) {
    const ticket = await this.getTicketById(ticketId)
    if (!ticket) return null

    const [messages, events, notes] = await Promise.all([
      this.listTicketMessages({ ticket: ticketId }, { order: { created_at: 'ASC' } }),
      this.listTicketEvents({ ticket: ticketId }, { order: { created_at: 'ASC' } }),
      this.listTicketNotes({ ticket_id: ticketId }, { order: { created_at: 'ASC' } }),
    ])

    return { ticket, messages, events, notes }
  }

  // ── Ticket merging ────────────────────────────────────────────────

  async mergeTickets(
    sourceTicketId: string,
    targetTicketId: string,
    performedByType?: string,
    performedById?: string,
  ) {
    if (sourceTicketId === targetTicketId) {
      throw new Error('Cannot merge a ticket with itself.')
    }

    const [source, target] = await Promise.all([
      this.getTicketById(sourceTicketId),
      this.getTicketById(targetTicketId),
    ])

    if (!source || !target) {
      throw new Error(`Both tickets must exist. Got source=${!source}, target=${!target}`)
    }

    if (source.customer_id !== target.customer_id) {
      throw new Error('Tickets can only be merged when they belong to the same customer.')
    }

    // Move messages from source to target
    const messages = await this.listTicketMessages({ ticket: sourceTicketId }, { take: 1000 })
    for (const msg of messages) {
      await this.updateTicketMessages([{ id: (msg as { id: string }).id, ticket: targetTicketId }])
    }

    // Move notes from source to target
    const notes = await this.listTicketNotes({ ticket_id: sourceTicketId }, { take: 1000 })
    for (const note of notes) {
      await this.updateTicketNotes([{ id: (note as { id: string }).id, ticket_id: targetTicketId }])
    }

    // Mark source closed and record merge in metadata
    await this.updateTickets([
      {
        id: sourceTicketId,
        status: TicketStatus.CLOSED,
        closed_at: new Date(),
        metadata: {
          ...((source.metadata as Record<string, unknown>) ?? {}),
          merged_into: targetTicketId,
        },
      },
    ])

    // Update target subject if needed (prepend note)
    await this.updateTickets([
      {
        id: targetTicketId,
        metadata: {
          ...((target.metadata as Record<string, unknown>) ?? {}),
          merged_from: sourceTicketId,
        },
      },
    ])

    const events: TicketEventData[] = [
      this.buildEvent(
        targetTicketId,
        TicketEventType.TICKET_MERGED,
        {
          source_ticket_id: sourceTicketId,
          source_subject: source.subject,
          messages_moved: messages.length,
          notes_moved: notes.length,
        },
        performedByType,
        performedById,
      ),
      this.buildEvent(
        sourceTicketId,
        TicketEventType.TICKET_MERGED,
        {
          merged_into: targetTicketId,
        },
        performedByType,
        performedById,
      ),
    ]

    await this.emitAndPersistEvents(targetTicketId, events, TicketEventName.MERGED, {
      source_ticket_id: sourceTicketId,
      target_ticket_id: targetTicketId,
    })

    return { source_ticket_id: sourceTicketId, target_ticket_id: targetTicketId }
  }

  // ── Notes ────────────────────────────────────────────────────────

  async addNote(ticketId: string, content: string, authorId?: string) {
    const [note] = await this.createTicketNotes([
      {
        ticket_id: ticketId,
        content,
        author_id: authorId ?? null,
      },
    ])
    return note
  }

  // ── Customer reply notifications ────────────────────────────────

  /**
   * Count tickets where the most recent message is from a customer.
   * These represent tickets needing admin attention.
   */
  async getUnreadCustomerReplyCount(): Promise<number> {
    const openTickets = await this.listTickets(
      {
        status: { $ne: TicketStatus.CLOSED },
      },
      { take: UNREAD_REPLY_TICKET_LIMIT },
    )

    const ticketIds = openTickets.map((ticket) => (ticket as { id: string }).id)
    if (ticketIds.length === 0) {
      return 0
    }

    const messageEvents = await this.listTicketEvents(
      { ticket: ticketIds, event_type: TicketEventType.MESSAGE_ADDED },
      { order: { created_at: 'DESC' }, take: UNREAD_REPLY_EVENT_LIMIT },
    )

    const latestSenderByTicket = new Map<string, string | null>()
    for (const event of messageEvents as Array<{
      ticket_id: string
      performed_by_type: string | null
    }>) {
      if (!latestSenderByTicket.has(event.ticket_id)) {
        latestSenderByTicket.set(event.ticket_id, event.performed_by_type)
      }
    }

    let count = 0
    for (const senderType of latestSenderByTicket.values()) {
      if (senderType === SenderTypeValues.CUSTOMER) count++
    }

    return count
  }

  /**
   * List tickets that have waiting customer replies (latest message from customer).
   */
  async listTicketsWithCustomerReplies(pagination?: PaginationParams) {
    const allOpen = await this.listTickets(
      { status: { $ne: TicketStatus.CLOSED } },
      { order: { updated_at: 'DESC' }, take: pagination?.take ?? 50, skip: pagination?.skip ?? 0 },
    )
    return allOpen
  }
}
