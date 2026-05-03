import { MedusaService } from '@medusajs/framework/utils'
import type { IEventBusModuleService } from '@medusajs/framework/types'
import { Ticket } from './models/ticket'
import { TicketMessage } from './models/ticket-message'
import { TicketEvent } from './models/ticket-event'
import {
  TicketStatus,
  TicketEventType,
  TicketEventName,
  type TicketCategory,
  type SenderType,
} from './constants'

type TicketRecord = {
  id: string
  subject: string
  category: string
  status: string
  customer_id: string
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
}

export default class SupportTicketModuleService extends MedusaService({
  Ticket,
  TicketMessage,
  TicketEvent,
}) {
  protected eventBusService_: IEventBusModuleService

  constructor(container: Record<string, unknown>) {
    super(...arguments)
    // @ts-expect-error - injected via module dependencies
    this.eventBusService_ = container.event_bus
  }

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
        sender_type: 'customer' as SenderType,
        sender_id: input.customerId,
        message: input.message,
        attachments: null,
      },
    ])

    await this.createTicketEvents([
      {
        ticket: ticket.id,
        event_type: TicketEventType.TICKET_CREATED,
        data: { category: input.category },
        performed_by_type: 'customer',
        performed_by_id: input.customerId,
      },
    ])

    await this.eventBusService_?.emit({
      name: TicketEventName.CREATED,
      data: {
        id: ticket.id,
        subject: input.subject,
        category: input.category,
        customer_id: input.customerId,
        order_id: input.orderId ?? null,
        message: input.message,
      },
    })

    return ticket as unknown as TicketRecord
  }

  async addMessage(input: AddMessageInput) {
    const [ticket] = await this.listTickets({ id: input.ticketId }, { take: 1 })
    if (!ticket) {
      throw new Error(`Ticket ${input.ticketId} not found`)
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
      {
        ticket: input.ticketId,
        event_type: TicketEventType.MESSAGE_ADDED,
        data: { sender_type: input.senderType },
        performed_by_type: input.senderType,
        performed_by_id: input.senderId ?? null,
      },
    ])

    const currentStatus = (ticket as any).status as string
    if (input.senderType === 'customer' && currentStatus !== TicketStatus.OPEN) {
      await this.updateTickets([{ id: input.ticketId, status: TicketStatus.WAITING_ADMIN }])
    } else if (input.senderType === 'admin') {
      await this.updateTickets([{ id: input.ticketId, status: TicketStatus.WAITING_CUSTOMER }])
    }

    await this.eventBusService_?.emit({
      name: TicketEventName.MESSAGE_ADDED,
      data: {
        ticket_id: input.ticketId,
        message_id: (message as any).id,
        sender_type: input.senderType,
        sender_id: input.senderId ?? null,
        message: input.message,
      },
    })

    return message
  }

  async updateTicket(
    ticketId: string,
    input: UpdateTicketInput,
    performedByType?: string,
    performedById?: string,
  ) {
    const [current] = await this.listTickets({ id: ticketId }, { take: 1 })
    if (!current) {
      return null
    }

    const updates: Record<string, unknown> = { id: ticketId }
    const events: Array<{
      ticket: string
      event_type: string
      data: Record<string, unknown> | null
      performed_by_type: string | null
      performed_by_id: string | null
    }> = []

    if (input.status) {
      const oldStatus = (current as any)?.status as string

      updates.status = input.status

      if (input.status === TicketStatus.CLOSED) {
        updates.closed_at = new Date()
        events.push({
          ticket: ticketId,
          event_type: TicketEventType.TICKET_CLOSED,
          data: { old_status: oldStatus },
          performed_by_type: performedByType ?? null,
          performed_by_id: performedById ?? null,
        })
      } else if (input.status === TicketStatus.OPEN && oldStatus === TicketStatus.CLOSED) {
        updates.closed_at = null
        events.push({
          ticket: ticketId,
          event_type: TicketEventType.TICKET_REOPENED,
          data: { old_status: oldStatus },
          performed_by_type: performedByType ?? null,
          performed_by_id: performedById ?? null,
        })
      } else {
        events.push({
          ticket: ticketId,
          event_type: TicketEventType.STATUS_CHANGED,
          data: { old_status: oldStatus, new_status: input.status },
          performed_by_type: performedByType ?? null,
          performed_by_id: performedById ?? null,
        })
      }
    }



    const [updated] = await this.updateTickets([updates])

    if (events.length > 0) {
      await this.createTicketEvents(events)
    }

    return updated
  }

  async deleteTicket(ticketId: string, performedByType?: string, performedById?: string) {
    const [ticket] = await this.listTickets({ id: ticketId }, { take: 1 })
    if (!ticket) {
      return null
    }

    await this.deleteTicketMessages({ ticket: ticketId })
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

  async listCustomerTickets(customerId: string, filters?: { status?: string }) {
    const queryFilters: Record<string, unknown> = { customer_id: customerId }
    if (filters?.status) {
      queryFilters.status = filters.status
    }

    return this.listTickets(queryFilters, {
      order: { created_at: 'DESC' },
    })
  }

  async getTicketWithMessages(ticketId: string) {
    const [ticket] = await this.listTickets({ id: ticketId }, { take: 1 })
    if (!ticket) {
      return null
    }

    const messages = await this.listTicketMessages(
      { ticket: ticketId },
      { order: { created_at: 'ASC' } },
    )

    const events = await this.listTicketEvents(
      { ticket: ticketId },
      { order: { created_at: 'ASC' } },
    )

    return { ticket, messages, events }
  }
}
