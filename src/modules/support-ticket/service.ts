import { MedusaService } from '@medusajs/framework/utils'
import { Modules } from '@medusajs/framework/utils'
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

  constructor(container: Record<string, unknown>) {
    super(...arguments)
    this.eventBusService_ = container[Modules.EVENT_BUS]
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
      [this.buildEvent(ticket.id, TicketEventType.TICKET_CREATED, { category: input.category }, SenderTypeValues.CUSTOMER, input.customerId)],
      TicketEventName.CREATED,
      { id: ticket.id, subject: input.subject, category: input.category, customer_id: input.customerId, order_id: input.orderId ?? null, message: input.message },
    )

    return ticket as unknown as TicketRecord
  }

  async addMessage(input: AddMessageInput) {
    const currentTicket = await this.getTicketById(input.ticketId)
    if (!currentTicket) {
      throw new Error(`Ticket ${input.ticketId} not found`)
    }

    const isClosed = currentTicket.status === TicketStatus.CLOSED

    // Reopen closed tickets before adding message
    if (isClosed) {
      await this.updateTickets([{ id: input.ticketId, status: TicketStatus.OPEN, closed_at: null }])
      await this.createTicketEvents([
        this.buildEvent(input.ticketId, TicketEventType.TICKET_REOPENED, { reason: 'message_received', sender_type: input.senderType }, input.senderType, input.senderId),
      ])
    }

    const [message] = await this.createTicketMessages([
      {
        ticket: input.ticketId,
        sender_type: input.senderType,
        sender_id: input.senderId ?? null,
        message: input.message,
        attachments: input.attachments ? { items: input.attachments } : null,
      },
    ])

    await this.createTicketEvents([
      this.buildEvent(input.ticketId, TicketEventType.MESSAGE_ADDED, { sender_type: input.senderType }, input.senderType, input.senderId),
    ])

    // Update status based on sender (skip for system messages)
    if (input.senderType !== SenderTypeValues.SYSTEM) {
      const effectiveStatus = isClosed ? TicketStatus.OPEN : currentTicket.status
      if (input.senderType === SenderTypeValues.CUSTOMER && effectiveStatus !== TicketStatus.OPEN) {
        await this.updateTickets([{ id: input.ticketId, status: TicketStatus.WAITING_ADMIN }])
      } else if (input.senderType === SenderTypeValues.ADMIN) {
        await this.updateTickets([{ id: input.ticketId, status: TicketStatus.WAITING_CUSTOMER }])
      }
    }

    await this.eventBusService_?.emit({
      name: TicketEventName.MESSAGE_ADDED,
      data: { ticket_id: input.ticketId, message_id: (message as { id: string }).id, sender_type: input.senderType, sender_id: input.senderId ?? null, message: input.message },
    })

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
        events.push(this.buildEvent(ticketId, TicketEventType.TICKET_CLOSED, { old_status: oldStatus }, performedByType, performedById))
      } else if (wasClosed) {
        events.push(this.buildEvent(ticketId, TicketEventType.TICKET_REOPENED, { old_status: oldStatus, new_status: input.status }, performedByType, performedById))
      } else {
        events.push(this.buildEvent(ticketId, TicketEventType.STATUS_CHANGED, { old_status: oldStatus, new_status: input.status }, performedByType, performedById))
      }
    }

    if (input.assignedTo !== undefined && input.assignedTo !== currentTicket.assigned_to) {
      updates.assigned_to = input.assignedTo
      events.push(this.buildEvent(ticketId, input.assignedTo ? TicketEventType.ASSIGNED : TicketEventType.UNASSIGNED, { old_assigned_to: currentTicket.assigned_to, new_assigned_to: input.assignedTo }, performedByType, performedById))
    }

    const [updated] = await this.updateTickets([updates])
    await this.emitAndPersistEvents(ticketId, events, TicketEventName.UPDATED, { id: ticketId, ...input })
    return updated
  }

  async deleteTicket(ticketId: string, performedByType?: string, performedById?: string) {
    const ticket = await this.getTicketById(ticketId)
    if (!ticket) {
      return null
    }

    // Create deletion event BEFORE deleting (so it persists)
    await this.createTicketEvents([
      this.buildEvent(ticketId, TicketEventType.TICKET_DELETED, {}, performedByType, performedById),
    ])

    await this.deleteTicketMessages({ ticket: ticketId })
    await this.deleteTicketEvents({ ticket: ticketId })
    await this.deleteTicketNotes({ ticket_id: ticketId })
    await this.deleteTickets({ id: ticketId })

    await this.eventBusService_?.emit({
      name: TicketEventName.DELETED,
      data: { id: ticketId, performed_by_type: performedByType ?? null, performed_by_id: performedById ?? null },
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

    const messages = await this.listTicketMessages({ ticket: ticketId }, { order: { created_at: 'ASC' } })
    const events = await this.listTicketEvents({ ticket: ticketId }, { order: { created_at: 'ASC' } })
    const notes = await this.listTicketNotes({ ticket_id: ticketId }, { order: { created_at: 'ASC' } })

    return { ticket, messages, events, notes }
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
}
