/**
 * An expected refusal with a stable code. Routes turn it into `{ code, message }`
 * with the given HTTP status instead of a generic 409/500.
 */
export class SupportTicketError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 409) {
    super(message)
    this.name = 'SupportTicketError'
    this.code = code
    this.status = status
  }
}

export function isSupportTicketError(error: unknown): error is SupportTicketError {
  return error instanceof SupportTicketError
}

/**
 * Mail setup refusals, worded the same way everywhere (tickets UI, API refusals, README).
 * They name the options of this plugin and of the email queue; a host that sets these up
 * elsewhere adds its own hint with the `setupHelp` module option.
 */

/** Shown when guest email replies cannot be sent because no reply domain is set up. */
export const REPLY_DOMAIN_NOT_CONFIGURED_MESSAGE =
  'Guest replies cannot be emailed: this shop has no reply domain for reply+ addresses. ' +
  'Set the reply_email_domain option of the supportTicket module (or SUPPORT_REPLY_EMAIL_DOMAIN), route that ' +
  'domain\'s inbound mail to POST /hooks/mailgun/inbound, and restart the backend. Drafts can still be saved.'

/** Shown when guest email replies cannot be sent because inbound email is turned off. */
export const INBOUND_EMAIL_DISABLED_MESSAGE =
  'Guest replies cannot be emailed: inbound email is turned off on this shop, so a guest\'s answer ' +
  'would never reach the ticket. Set the mailgun_inbound_enabled and mailgun_webhook_signing_key options of the ' +
  'supportTicket module (or SUPPORT_MAILGUN_INBOUND_ENABLED=true and MAILGUN_WEBHOOK_SIGNING_KEY) and restart the ' +
  'backend. Drafts can still be saved.'

/** Shown when no email queue (medusa-notification-smtp) is registered on the backend. */
export const EMAIL_QUEUE_NOT_CONFIGURED_MESSAGE =
  'Email sending is not set up for this shop (no email queue). ' +
  'Register an email queue module such as medusa-notification-smtp (its container key is the email_queue_module ' +
  'option, default "emailQueue") with SMTP or Mailgun delivery, and restart the backend.'

/** Refusal for a plain admin reply on a guest ticket: guests have no account, so only the email draft flow reaches them. */
export const GUEST_TICKET_USE_EMAIL_DRAFT_MESSAGE =
  'This is a guest ticket (no customer account), so a plain reply would reach nobody. ' +
  'Answer with an email draft: POST /admin/tickets/:id/email-drafts, then POST /admin/tickets/email-drafts/:draft_id/send ' +
  '(in the admin: Save draft, then Send email). Use a note for internal comments.'
