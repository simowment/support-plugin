# Medusa Support Tickets Plugin

Medusa v2 plugin for customer support tickets. Provides a complete ticket management system with customer-facing submission and messaging, admin triage workflows, internal notes, file attachments, AI-powered analysis with auto-reply, Discord notifications, and real-time updates via server-sent events.

## Features

- Customer-authenticated store API for ticket creation, status tracking, and messaging.
- Admin-authenticated API for ticket triage, status transitions, replies, internal notes, merging, and bulk operations.
- Full event history for every ticket action (created, status change, assignment, merge, deletion) with audit trail.
- File upload with MIME type validation (images, PDF, text, CSV, Office documents), 10 MB per file, max 5 files per message.
- Configurable AI module with pluggable LLM providers (OpenAI, OpenRouter, custom) for ticket analysis, auto-reply, and escalation detection.
- Auto-reply with confidence threshold (≥85%), blocked categories for sensitive topics (refund, payment, fraud, legal, etc.).
- Escalation detection via AI tool calls with Discord webhook alerts.
- Optional Discord webhook notifications for new tickets, customer replies, and ticket closure.
- Server-sent events for real-time ticket updates in both admin and customer views.
- Medusa Admin page for ticket management (`/app/tickets`, split-panel UI) with inline AI Assistant tab and AI configuration drawer.
- Ticket merging (same customer only) with message/note migration and audit events.
- Internal notes (admin-only, not visible to customers).
- 6 ticket categories: order issue, return, fulfillment, product inquiry, payment, general.

## Installation

Add the plugin to your Medusa project:

```bash
# pnpm
pnpm add @medusastore/medusa-plugin-support-tickets

# npm
npm install @medusastore/medusa-plugin-support-tickets

# bun
bun add @medusastore/medusa-plugin-support-tickets
```

## Configuration

Register the plugin in `medusa-config.ts`. No options are required for the core ticketing features.

```ts
{
  resolve: '@medusastore/medusa-plugin-support-tickets',
}
```

The AI module does not ship with a default provider, model, or base URL. Configure AI at runtime from the Admin AI Support page, or provide startup overrides from your backend environment.

```ts
{
  resolve: '@medusastore/medusa-plugin-support-tickets',
  options: {
    openai_api_key: process.env.OPENAI_API_KEY,       // optional, overrides DB setting
    openai_model: process.env.OPENAI_MODEL,            // optional, overrides DB setting
    openai_base_url: process.env.OPENAI_BASE_URL,      // optional, overrides DB setting
  },
}
```

## Environment variables

Copy `.env.example` and fill in your values.

Optional:

- `DISCORD_WEBHOOK_URL` — Discord channel webhook for new ticket, customer reply, ticked closed, and escalation notifications.
- `SUPPORT_TICKET_AI_KEY_ENCRYPTION_KEY` — high-entropy secret required before storing or reading AI provider API keys from the Admin UI. Persisted API keys must be encrypted with AES-256-GCM.
- `OPENAI_API_KEY` — AI provider API key (runtime override, otherwise configured from admin).
- `OPENAI_MODEL` - AI model name override.
- `OPENAI_BASE_URL` - AI provider base URL override.

## Database

Run migrations after installing or changing plugin models.

```bash
pnpm medusa db:migrate
```

The plugin creates the following tables:

- `ticket` — Support tickets with subject, category, status, customer, assignment, order reference.
- `ticket_message` — Messages on tickets with sender type, content, and optional attachments.
- `ticket_event` — Audit events (status changes, assignments, merges, deletions).
- `ticket_note` — Internal admin notes.
- `ai_setting` — AI provider and prompt configuration (key-value pairs).
- `ai_ticket_analysis` — AI analysis results per ticket.

## API surface

### Store routes

| Method | Path                          | Description                                                      |
| ------ | ----------------------------- | ---------------------------------------------------------------- |
| `GET`  | `/store/tickets`              | List customer's tickets (optional status filter)                 |
| `POST` | `/store/tickets`              | Create a new ticket                                              |
| `GET`  | `/store/tickets/:id`          | Get ticket with messages, events, and notes (ownership verified) |
| `POST` | `/store/tickets/:id/messages` | Reply to a ticket (customer)                                     |
| `GET`  | `/store/tickets/:id/events`   | SSE endpoint for real-time ticket updates                        |
| `POST` | `/store/tickets/upload`       | Upload file attachments                                          |

### Admin routes

| Method   | Path                           | Description                                                        |
| -------- | ------------------------------ | ------------------------------------------------------------------ |
| `GET`    | `/admin/tickets`               | List tickets (filters: status, category, customer_id, assigned_to) |
| `GET`    | `/admin/tickets/:id`           | Get full ticket details with messages, events, notes               |
| `POST`   | `/admin/tickets/:id`           | Update ticket (status, assigned_to)                                |
| `DELETE` | `/admin/tickets/:id`           | Delete ticket and associated data                                  |
| `POST`   | `/admin/tickets/:id/messages`  | Reply as admin                                                     |
| `GET`    | `/admin/tickets/:id/notes`     | List internal notes                                                |
| `POST`   | `/admin/tickets/:id/notes`     | Add internal note                                                  |
| `POST`   | `/admin/tickets/:id/merge`     | Merge source ticket into this ticket (same customer only)          |
| `POST`   | `/admin/tickets/bulk`          | Bulk update tickets (status, assignment)                           |
| `GET`    | `/admin/tickets/events`        | SSE endpoint for admin notification indicators                     |
| `GET`    | `/admin/tickets/notifications` | Unread customer reply count and recent tickets                     |
| `POST`   | `/admin/tickets/upload`        | Upload file attachments                                            |
| `GET`    | `/admin/tickets/ai-settings`   | Get AI configuration (provider, prompts, enabled flags)            |
| `POST`   | `/admin/tickets/ai-settings`   | Update AI configuration                                            |
| `GET`    | `/admin/tickets/:id/ai`        | Get AI analysis for a ticket                                       |
| `POST`   | `/admin/tickets/:id/ai`        | Trigger on-demand AI analysis                                      |

### Attachment routes

| Method | Path                                                              | Description                                                                 |
| ------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET`  | `/support-tickets/tickets/:ticket_id/attachments/:file_id`        | Stream a private attachment after admin auth or customer ownership checking |

### Modules

- **`supportTicket`** — Core ticket module (Ticket, TicketMessage, TicketEvent, TicketNote models; create, update, delete, merge, addMessage, addNote, listCustomerTickets, getTicketWithMessages, getUnreadCustomerReplyCount).
- **`supportTicketAi`** — AI analysis module (AITicketAnalysis, AISetting models; analyzeTicket, analyzeMessage, provider/prompt configuration, auto-reply gating, escalation detection).

### Subscribers

- **ticket-notifications** — Listens to `support_ticket.created`, `.message_added`, `.updated`, `.closed`, `.deleted`; emits SSE events and sends Discord webhooks.
- **ai-ticket-analyzer** — Listens to `support_ticket.created` and `.message_added` (customer only); runs AI analysis, triggers auto-reply if eligible, and sends escalation webhooks.

## Admin usage

After registration, open the Medusa Admin and use the **Tickets** page (`/app/tickets`) to:

- view, filter, and search tickets,
- reply to customers and add internal notes,
- change status and assign tickets to staff,
- merge duplicate tickets (same customer),
- inspect ticket history and event timeline,
- delete tickets.

Use the **AI Assistant** tab inside `/app/tickets` (or click the sparkle icon in the context panel) to:

- enable/disable AI analysis,
- enable/disable auto-reply,
- configure the AI provider and model,
- view prompt config and customize analysis/response/escalation prompts,
- inspect AI analysis results per ticket.

## Project structure

```text
src/
├── admin/             # Admin dashboard pages and API helpers
│   ├── i18n/          # i18n configuration
│   ├── lib/           # Admin fetch wrapper with CSRF support
│   └── routes/        # Tickets split-panel page + AI Support settings page
├── api/               # Admin and store API routes
│   ├── admin/         # Admin route handlers (tickets, bulk, merge, notes, AI, upload)
│   ├── store/         # Store route handlers (tickets, messages, events, upload)
│   └── shared/        # Shared helpers, event bus, file upload logic
├── jobs/              # Reserved for future scheduled jobs
├── links/             # Reserved for future link definitions
├── modules/           # Core ticket module + AI analysis module
│   ├── ai/            # AI models, migrations, OpenAI provider, validation, service
│   └── support-ticket/# Ticket models, migrations, service
├── providers/         # Reserved for future providers
├── subscribers/       # Discord/SSE notifications + AI ticket analyzer
├── utils/             # Error extraction utility + escalation webhook
└── workflows/         # Reserved for future workflow logic
```

## Notes

- Tickets follow a status lifecycle: `open` → `in_progress` / `waiting_customer` / `waiting_admin` → `closed`. Closed tickets are reopened automatically when a new message is received.
- AI auto-reply requires a confidence score of ≥0.85 and is blocked for sensitive categories (refund, payment, fraud, legal, etc.). Auto-reply is disabled by default.
- The AI provider has no built-in default. Provider, API key, model, and base URL must be configured before AI analysis or response generation can run.
- File uploads are validated server-side via MIME magic bytes. Allowed types: PNG, JPEG, WebP, GIF, SVG, PDF, plain text, CSV, DOC, DOCX, XLS, XLSX.
- Attachments are uploaded with Medusa File Module `private` access. Persisted attachment URLs point to an authenticated plugin route that streams files only to admins or to the customer that owns the ticket. Configure the active Medusa file provider so private objects are not publicly readable.
- **SSE deployment model** — Real-time ticket updates use an in-memory event bus. This works for a single Medusa process. Multi-instance deployments should use sticky sessions or replace the event bus with Redis/pubsub before relying on SSE for cross-instance delivery.
- SSE connections send a heartbeat every 30 seconds. The store endpoint verifies ticket ownership before subscribing.
- Plugin options are optional. AI settings can be configured entirely from the admin UI; startup environment variables are only overrides.

## License

MIT


