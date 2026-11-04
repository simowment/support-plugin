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
export { TicketNote } from './models/ticket-note'
export { InboundEmailReceipt } from './models/inbound-email-receipt'
export { EmailReplyToken } from './models/email-reply-token'
export { OutboundEmailDraft } from './models/outbound-email-draft'
export type { default as SupportTicketModuleService } from './service'
export type {
  InboundEmailAttachment,
  ReceiveInboundEmailInput,
  ReceiveInboundEmailResult,
} from './service'
