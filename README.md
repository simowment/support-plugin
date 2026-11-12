# Medusa Support Tickets Plugin

Customer support tickets for Medusa v2. Signed-in customers open tickets from the storefront, staff answer them from a
Medusa Admin inbox, and the answer is emailed to the customer. Inbound email (Mailgun) can open guest tickets that
staff answer by email too. AI triage
(analysis, suggested replies, optional auto-reply and escalation) is optional and works with any OpenAI-compatible
endpoint.

## Features

- Customer-authenticated store API: create tickets, list own tickets, reply, live updates over server-sent events (SSE).
- Admin API and inbox page: filter/search, "assigned to me", reply, change status, assign to an admin, internal notes,
  merge (same customer), delete, readable activity log. A help strip says where tickets come from and what this shop
  can do (email intake, emailed replies, guest replies, AI), from `GET /admin/tickets/config`.
- Admin replies to signed-in customers are emailed to them through the email queue (medusa-notification-smtp). With a
  reply domain the Reply-To is a one-time `reply+<token>@<domain>` address, so the customer's answer lands on the
  ticket; otherwise it is the support mailbox (`SUPPORT_EMAIL`).
- Private file attachments (images, PDF, text, CSV, Office documents), 10 MB per file, up to 5 files per message,
  validated by MIME magic bytes and served only to admins or the owning customer.
- Optional Mailgun inbound email: signed webhook opens guest tickets from configured mailboxes and threads guest
  replies through one-time `reply+<token>@<domain>` addresses.
- Guest email replies: staff write a draft, review it and send it through an email queue module (see
  [Guest email replies](#guest-email-replies)).
- Optional AI module: ticket analysis, suggested responses, auto-reply gated by a confidence threshold (0.85) and
  blocked categories (refund, payment, chargeback, fraud, legal, complaint, shipping_issue), escalation detection.
  Provider, model, base URL, API key and prompts are editable from the Admin.
- Optional Discord-compatible webhook notifications for new tickets, customer replies, closures and AI escalations.

## Compatibility

| Requirement | Version                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| Medusa      | `@medusajs/framework`, `@medusajs/medusa`, `@medusajs/core-flows` **2.22.6** |
| Node.js     | `>=20.19.0`                                                                  |
| Database    | PostgreSQL (the module uses the Medusa PG connection for inbound email)      |
| React       | `^18` (Admin extension)                                                      |

Medusa's Cache and Locking modules must be available (they are by default); the inbound email route uses them for
replay protection.

## Installation

```bash
pnpm add @medusastore/medusa-plugin-support-tickets
```

Until the package is on npm, install a release tarball from
[the releases page](https://github.com/simowment/support-plugin/releases) instead
(`pnpm add ./medusastore-medusa-plugin-support-tickets-<version>.tgz`).

Register the plugin in `medusa-config.ts`:

```ts
module.exports = defineConfig({
  // ...
  plugins: [
    {
      resolve: '@medusastore/medusa-plugin-support-tickets',
      options: {},
    },
  ],
})
```

The plugin ships two modules, `supportTicket` (`modules/support-ticket`) and `supportTicketAi` (`modules/ai`). Medusa
registers them automatically from the plugin. If you register them explicitly (for example in a workspace setup where
plugin modules are not auto-registered), pass module options there:

```ts
modules: [
  {
    resolve: '@medusastore/medusa-plugin-support-tickets/modules/support-ticket',
    options: {
      mailgun_inbound_enabled: true,
      mailgun_webhook_signing_key: process.env.MAILGUN_WEBHOOK_SIGNING_KEY,
      inbound_recipients: ['support@example.com'],
      reply_email_domain: 'reply.example.com',
      discord_webhook_url: process.env.SUPPORT_DISCORD_WEBHOOK,
    },
  },
  {
    resolve: '@medusastore/medusa-plugin-support-tickets/modules/ai',
    options: {
      openai_api_key: process.env.MY_AI_KEY,
      openai_model: 'gpt-4o-mini',
      openai_base_url: 'https://api.openai.com/v1',
      api_key_encryption_key: process.env.SUPPORT_TICKET_AI_KEY_ENCRYPTION_KEY,
    },
  },
]
```

Then run the migrations (see below) and restart Medusa.

## Configuration

No option is required for core ticketing. All configuration is resolved in `src/lib/config.ts`; an environment
variable is read only when the matching option is unset.

### `supportTicket` module options

| Option                        | Env fallback                      | Default        | Description                                                                                                                                     |
| ----------------------------- | --------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `mailgun_inbound_enabled`     | `SUPPORT_MAILGUN_INBOUND_ENABLED` | `false`        | Enables `POST /hooks/mailgun/inbound`. The env fallback must be exactly `true`. When disabled the route answers `503`.                          |
| `mailgun_webhook_signing_key` | `MAILGUN_WEBHOOK_SIGNING_KEY`     | none           | Mailgun HTTP webhook signing key. Without it inbound requests are rejected with `503`.                                                          |
| `inbound_recipients`          | `SUPPORT_INBOUND_RECIPIENTS`      | `[]`           | Mailboxes (array, or comma-separated string) whose mail opens new guest tickets. Other recipients are rejected unless they are reply addresses. |
| `reply_email_domain`          | `SUPPORT_REPLY_EMAIL_DOMAIN`      | none           | Domain for `reply+<token>@<domain>` guest reply addresses. Required to receive guest replies and to send guest email drafts.                    |
| `discord_webhook_url`         | `DISCORD_WEBHOOK_URL`             | none           | Discord-compatible webhook for new ticket, customer reply, closed and escalation messages. Unset means no webhook calls.                        |
| `email_queue_module`          | none                              | `"emailQueue"` | Container key of the email queue used to email replies (customer and guest).                                                                    |
| `support_email`               | `SUPPORT_EMAIL`                   | none           | Support mailbox, used as the Reply-To of emailed customer replies when no reply domain is set.                                                  |
| `email_customer_replies`      | none                              | `true`         | Email admin replies (and AI auto-replies) to signed-in customers. Set `false` to only store them on the ticket.                                  |
| `setupHelp`                   | none                              | none           | `{ text?: string; url?: string }`. Host hint shown in the admin help strip under the mail setup text (for hosts that set up mail outside the admin). Returned as `setup_help` (`{ text, url }` or `null`) by `GET /admin/tickets/config`. |

### `supportTicketAi` module options

Admin-saved settings (AI Settings drawer) take precedence over these options; the options are fallbacks.

| Option                    | Env fallback                           | Default                         | Description                                                                                                     |
| ------------------------- | -------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `openai_api_key`          | none                                   | none                            | API key for an OpenAI-compatible endpoint.                                                                      |
| `openai_model`            | none                                   | none                            | Model id.                                                                                                       |
| `openai_base_url`         | none                                   | none                            | OpenAI-compatible base URL (must be a valid URL).                                                               |
| `openai_headers`          | none                                   | `{}`                            | Extra HTTP headers sent with every AI request.                                                                  |
| `default_provider`        | none                                   | `"openrouter"`                  | Provider label used when none is saved in the Admin (all labels use the OpenAI-compatible client).              |
| `api_key_encryption_key`  | `SUPPORT_TICKET_AI_KEY_ENCRYPTION_KEY` | none                            | Secret used to encrypt API keys saved from the Admin (AES-256-GCM). Required before a key can be saved or read. |
| `portkey_gateway_markers` | none                                   | Portkey hosts (see `config.ts`) | Base URL fragments treated as a Portkey gateway; matching requests get an `x-portkey-provider` header.          |

The plugin itself does not read AI provider environment variables (such as `OPENAI_API_KEY`); map your own variables
to the options above. See `.env.example` for the environment fallbacks.

## Database / migrations

```bash
npx medusa db:migrate
```

| Table                          | Model                 | Purpose                                                        |
| ------------------------------ | --------------------- | -------------------------------------------------------------- |
| `ticket`                       | `Ticket`              | Ticket subject, category, status, customer or guest contact.   |
| `ticket_message`               | `TicketMessage`       | Messages with sender type and attachment descriptors.          |
| `ticket_event`                 | `TicketEvent`         | Audit trail (status, assignment, merge, delete, email events). |
| `ticket_note`                  | `TicketNote`          | Internal admin notes.                                          |
| `ticket_inbound_email_receipt` | `InboundEmailReceipt` | Idempotency records for inbound email.                         |
| `ticket_email_reply_token`     | `EmailReplyToken`     | Hashed one-time guest reply tokens.                            |
| `ticket_outbound_email_draft`  | `OutboundEmailDraft`  | Reviewed guest email replies and their queue status.           |
| `ai_setting`                   | `AISetting`           | AI provider, prompt and flag settings (key/value).             |
| `ai_ticket_analysis`           | `AITicketAnalysis`    | AI analysis results per ticket.                                |

Ticket statuses: `open`, `in_progress`, `waiting_customer`, `waiting_admin`, `closed` (a new message reopens a closed
ticket). Categories: `order_issue`, `return_request`, `fulfillment_issue`, `product_inquiry`, `payment_issue`,
`general`.

## API routes

### Store (customer session or bearer token)

| Method | Path                          | Purpose                                                                              |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------ |
| `GET`  | `/store/tickets`              | List the customer's tickets (optional `status`, paging).                             |
| `POST` | `/store/tickets`              | Create a ticket (`subject`, `category`, `message`, optional `order_id`, `metadata`). |
| `GET`  | `/store/tickets/:id`          | Ticket with messages and events (no internal notes).                                 |
| `POST` | `/store/tickets/:id/messages` | Customer reply with optional attachments.                                            |
| `GET`  | `/store/tickets/:id/events`   | SSE stream for that ticket (ownership checked).                                      |
| `POST` | `/store/tickets/upload`       | Upload attachments (multipart).                                                      |

### Admin (user session, bearer token or secret API key)

| Method   | Path                                         | Purpose                                                                                |
| -------- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET`    | `/admin/tickets`                             | List tickets (`status`, `category`, `customer_id`, `assigned_to`, `q`, `tab`, paging). Each row has `customer` (name/email or null) and `customer_deleted`. |
| `GET`    | `/admin/tickets/config`                      | What the inbox can do: email intake, emailed replies, guest replies (with the reason when not), AI state, and the host's `setup_help` hint. No secrets. |
| `GET`    | `/admin/tickets/:id`                         | Ticket with messages, events and notes.                                                |
| `POST`   | `/admin/tickets/:id`                         | Update `status` / `assigned_to`.                                                       |
| `DELETE` | `/admin/tickets/:id`                         | Delete a ticket and its data.                                                          |
| `POST`   | `/admin/tickets/:id/messages`                | Reply as admin to a signed-in customer; `email.will_send` says whether it is emailed. Guest tickets: `409 GUEST_TICKET_USE_EMAIL_DRAFT` (use email drafts). |
| `GET`    | `/admin/tickets/:id/notes`                   | List internal notes.                                                                   |
| `POST`   | `/admin/tickets/:id/notes`                   | Add an internal note.                                                                  |
| `POST`   | `/admin/tickets/:id/merge`                   | Merge `source_ticket_id` into this ticket (same customer).                             |
| `GET`    | `/admin/tickets/:id/email-drafts`            | List guest email drafts with delivery status.                                          |
| `POST`   | `/admin/tickets/:id/email-drafts`            | Create or revise a guest email draft.                                                  |
| `POST`   | `/admin/tickets/email-drafts/:draft_id/send` | Send a reviewed draft (human admin session only). Refusals: `400 REPLY_DOMAIN_NOT_CONFIGURED`, `400 EMAIL_QUEUE_NOT_CONFIGURED`, `404 DRAFT_NOT_FOUND`, `409 DRAFT_REVISION_CHANGED`, `409 RECIPIENT_CHANGED`, `409 DRAFT_NOT_SENDABLE`; `409 SEND_RECONCILIATION_REQUIRED` only when the send was interrupted (retry the same request). |
| `POST`   | `/admin/tickets/bulk`                        | Bulk status / assignment update (max 50).                                              |
| `GET`    | `/admin/tickets/events`                      | SSE stream for admin indicators.                                                       |
| `GET`    | `/admin/tickets/notifications`               | Unread customer reply count and recent tickets.                                        |
| `POST`   | `/admin/tickets/upload`                      | Upload attachments (multipart).                                                        |
| `GET`    | `/admin/tickets/ai-settings`                 | AI flags, provider (API key is never returned) and prompts.                            |
| `POST`   | `/admin/tickets/ai-settings`                 | Update AI flags, provider and prompts.                                                 |
| `GET`    | `/admin/tickets/:id/ai`                      | Stored AI analysis for a ticket.                                                       |
| `POST`   | `/admin/tickets/:id/ai`                      | Run AI analysis on demand ("Analyze now"). `400 AI_DISABLED` / `400 AI_NOT_CONFIGURED` when it cannot run. |
| `POST`   | `/admin/tickets/:id/ai/suggest`              | Generate a suggested reply from an existing analysis.                                  |

### Other

| Method | Path                                                       | Purpose                                                            |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `GET`  | `/support-tickets/tickets/:ticket_id/attachments/:file_id` | Stream a private attachment to an admin or the owning customer.    |
| `POST` | `/hooks/mailgun/inbound`                                   | Mailgun inbound webhook (signature-verified; disabled by default). |

## Admin UI

- **Support tickets** route (`/app/tickets`):
  - a help strip (hideable) explaining where tickets come from and whether email intake, emailed replies, guest
    replies and AI are working on this shop, which options set them up, and the host's `setupHelp` hint when
    one is configured;
  - the list shows the customer's name ("Deleted customer" when the account is gone), with status, category and
    "Assigned to me" filters and a labelled Refresh;
  - the ticket view has the conversation with a reply box (it says where the reply goes), internal notes, a readable
    Activity log and AI suggestions; guests get an "Email reply to <address>" panel with Save draft / Send email,
    disabled with the reason when the shop cannot send;
  - the side panel has a plain Status select, an admin-user "Assigned to" select, the customer's other tickets and
    "Merge one into this ticket…" (the other ticket's messages and notes move here and it is closed).
- **AI suggestions** tab and **AI settings** drawer: shows "Not set up" when no provider key is configured, "Analyze now"
  for tickets that arrived before AI was set up, the real auto-reply rules (85% confidence, blocked categories) and a
  cost note.

The plugin adds no widgets to other Admin pages.

## Events, subscribers & scheduled jobs

Events emitted by the `supportTicket` module: `support_ticket.created`, `support_ticket.message_added`,
`support_ticket.updated`, `support_ticket.closed` (when a ticket's status changes to closed, in addition to
`updated`), `support_ticket.deleted`, `support_ticket.merged`, `support_ticket.customer_reply` (inbound email reply).

| Subscriber             | Events                                           | Behaviour                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ticket-notifications` | created, message_added, updated, closed, deleted | Pushes SSE updates; posts to the Discord webhook when one is configured (new ticket, customer reply, closed).                                                                                     |
| `ticket-reply-email`   | message_added (admin or system sender)           | Emails the reply to a signed-in customer through the email queue (idempotency key `support-ticket-admin-reply:<message id>`). Guest tickets use the reviewed draft flow instead.           |
| `ai-ticket-analyzer`   | created, message_added (customer only)           | Runs AI analysis when AI is enabled **and** a provider is configured; auto-replies if enabled and eligible; sends escalations to the webhook. Email-channel tickets are not analysed on creation. |

To disable AI processing, toggle **AI enabled** off in the AI Settings drawer (or leave the provider unconfigured: the
analyzer then logs and skips). Auto-reply is off until enabled in the Admin. Leave `discord_webhook_url` unset to
disable webhook calls. The plugin has no scheduled jobs.

## Storefront integration

- Call the store routes with the customer's session or bearer token (`credentials: 'include'` for cookie sessions).
- Upload files with `POST /store/tickets/upload` first, then pass the returned descriptors as `attachments` when
  creating a message.
- Subscribe to `GET /store/tickets/:id/events` with `EventSource` for live updates; the server sends a heartbeat every
  30 seconds.
- Attachment URLs point to `/support-tickets/tickets/:ticket_id/attachments/:file_id` on the backend and require the
  customer's credentials.

## Guest email replies

Guest tickets (opened by inbound email, no customer account) are answered by email. Staff save a draft, review it and
send it; the plugin freezes the payload and enqueues it on the container service named by `email_queue_module`
(default `emailQueue`). That service must implement:

```ts
enqueue(input: { idempotencyKey: string; recipientEmail: string; subject: string; templateKey: string; payload: Record<string, unknown>; category: string; metadata?: Record<string, unknown> }): Promise<string>
getJob(id: string): Promise<{ id: string; status: string } | null>
getJobByIdempotencyKey(key: string): Promise<{ id: string; status: string } | null>
```

The payload uses `templateKey: '__inline__'` with `to`, `subject`, `text`, `html` and `reply_to`. Without a registered
queue the send route answers `400 EMAIL_QUEUE_NOT_CONFIGURED`, and without a reply domain `400
REPLY_DOMAIN_NOT_CONFIGURED`; drafts can still be saved. The admin panel disables Send email and shows the reason.

The same queue carries the emailed replies to signed-in customers (see `ticket-reply-email`).

## Security notes

- Store routes require an authenticated customer; ownership is checked on every ticket read, reply and SSE stream.
- Admin routes require an authenticated user; sending guest email requires a human user session (not an API key).
- The Mailgun webhook verifies the HMAC signature and timestamp, binds each signed token to its payload hash to block
  replays, rejects unknown recipients, ignores automated mail and caps body and attachment sizes.
- Guest reply tokens are random, stored hashed, and bound to the expected sender address.
- AI API keys saved from the Admin are encrypted with AES-256-GCM using `api_key_encryption_key`; the key is never
  returned by the API. Keep that secret and the Mailgun signing key out of source control.
- Attachments are stored with File Module `private` access. Configure your file provider so private objects are not
  publicly readable.
- Ticket content is sent to your AI provider and (as previews) to the Discord webhook when those are configured.

## Limitations / status

- Version `0.x`: APIs may change.
- SSE uses an in-memory event bus: it works for a single Medusa process. Multi-instance deployments need sticky
  sessions or a shared pub/sub before relying on live updates across instances.
- Inbound email supports Mailgun only.
- Notifications use the Discord webhook payload format.
- Admin UI copy is English only.
- The AI module uses an OpenAI-compatible chat API; other APIs need a new provider in `src/modules/ai/providers`.

## License

MIT
