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
 * The igm commands that set up mail, worded the same way everywhere (tickets UI, API
 * refusals, README). `provision mail` sets up a Mailgun domain end to end, including the
 * inbound routes and the `reply+<token>@` reply domain that guest replies need.
 * `configure mail` stores existing SMTP or Mailgun credentials; it can send email but only
 * sets a reply domain when its input carries `support_inbound`.
 */
export const MAIL_SETUP_COMMAND = 'igm shop provision mail --shop <slug>'
export const MAIL_CONFIGURE_COMMAND = 'igm shop configure mail --shop <slug>'

/** Shown when guest email replies cannot be sent because no reply domain is set up. */
export const REPLY_DOMAIN_NOT_CONFIGURED_MESSAGE =
  'Guest replies cannot be emailed: this shop has no reply domain for reply+ addresses. ' +
  `Run \`${MAIL_SETUP_COMMAND}\` to set up support email with replies. Drafts can still be saved.`

/** Shown when guest email replies cannot be sent because inbound email is turned off. */
export const INBOUND_EMAIL_DISABLED_MESSAGE =
  'Guest replies cannot be emailed: inbound email is turned off on this shop, so a guest\'s answer ' +
  `would never reach the ticket. Run \`${MAIL_SETUP_COMMAND}\` to turn on support email with replies. Drafts can still be saved.`

/** Shown when no email queue (medusa-notification-smtp) is registered on the backend. */
export const EMAIL_QUEUE_NOT_CONFIGURED_MESSAGE =
  'Email sending is not set up for this shop (no email queue). ' +
  `Run \`${MAIL_SETUP_COMMAND}\` (Mailgun), or \`${MAIL_CONFIGURE_COMMAND}\` with an existing SMTP or Mailgun account.`

/** Refusal for a plain admin reply on a guest ticket: guests have no account, so only the email draft flow reaches them. */
export const GUEST_TICKET_USE_EMAIL_DRAFT_MESSAGE =
  'This is a guest ticket (no customer account), so a plain reply would reach nobody. ' +
  'Answer with an email draft: POST /admin/tickets/:id/email-drafts, then POST /admin/tickets/email-drafts/:draft_id/send ' +
  '(in the admin: Save draft, then Send email). Use a note for internal comments.'
