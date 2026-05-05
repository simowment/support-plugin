import { Module } from '@medusajs/framework/utils'
import SupportTicketModuleService from './service'
import { SUPPORT_TICKET_MODULE } from './constants'

export default Module(SUPPORT_TICKET_MODULE, {
  service: SupportTicketModuleService,
})

export { SUPPORT_TICKET_MODULE } from './constants'
export {
  TicketStatus,
  TicketCategory,
  SenderType,
  TicketEventType,
  TicketEventName,
} from './constants'
export { Ticket } from './models/ticket'
export { TicketMessage } from './models/ticket-message'
export { TicketEvent } from './models/ticket-event'
export type { default as SupportTicketModuleService } from './service'
