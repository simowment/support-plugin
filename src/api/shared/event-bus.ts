import { EventEmitter } from 'events'

type TicketEventData = {
  ticketId: string
  type: 'message_added' | 'status_changed' | 'note_added'
  payload?: unknown
}

class TicketEventBus {
  private emitter = new EventEmitter()

  emit(event: TicketEventData) {
    this.emitter.emit(`ticket:${event.ticketId}`, event)
    this.emitter.emit('ticket:*', event)
  }

  on(ticketId: string, handler: (event: TicketEventData) => void) {
    this.emitter.on(`ticket:${ticketId}`, handler)
    return () => this.emitter.off(`ticket:${ticketId}`, handler)
  }

  onAny(handler: (event: TicketEventData) => void) {
    this.emitter.on('ticket:*', handler)
    return () => this.emitter.off('ticket:*', handler)
  }
}

export const ticketEventBus = new TicketEventBus()
