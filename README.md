# Medusa Support Tickets Plugin

Medusa v2 plugin for customer support tickets. It adds customer ticket submission, admin ticket management, ticket messages, internal notes, event history, file uploads, Discord notifications, and a custom Admin dashboard page.

## Features

- Customer-authenticated store routes for ticket creation and replies.
- Admin-authenticated routes for ticket triage, status updates, replies, notes, merging, and bulk actions.
- Ticket event history for auditability.
- File upload validation for ticket attachments.
- Optional Discord webhook notifications for new tickets and customer replies.
- Server-sent events for real-time ticket updates.
- Medusa Admin route at `/app/tickets`.
- Mobile-friendly split-panel admin UI.

## Installation

```bash
pnpm add @medusastore/medusa-plugin-support-tickets
```

## Configuration

Register the plugin in `medusa-config.ts`.

```ts
{
  resolve: '@medusastore/medusa-plugin-support-tickets',
}
```

## Environment variables

No environment variables are required.

Optional:

```env
DISCORD_WEBHOOK_URL=
```

Set `DISCORD_WEBHOOK_URL` to receive Discord notifications when customers create tickets or reply.

## Database

Run migrations after installing the plugin.

```bash
pnpm --dir backend medusa db:migrate
```

## API overview

### Store routes

- `GET /store/tickets`
- `POST /store/tickets`
- `GET /store/tickets/:id`
- `POST /store/tickets/:id/messages`
- `GET /store/tickets/:id/events`
- `POST /store/tickets/upload`

### Admin routes

- `GET /admin/tickets`
- `POST /admin/tickets`
- `GET /admin/tickets/:id`
- `POST /admin/tickets/:id`
- `DELETE /admin/tickets/:id`
- `POST /admin/tickets/:id/messages`
- `POST /admin/tickets/:id/notes`
- `POST /admin/tickets/:id/merge`
- `POST /admin/tickets/bulk`
- `GET /admin/tickets/events`
- `GET /admin/tickets/notifications`
- `POST /admin/tickets/upload`

## Admin usage

Open the Medusa Admin and go to **Tickets**. Staff can filter tickets, reply to customers, add internal notes, merge duplicates, assign ownership, inspect ticket history, and close tickets.

## Project structure

```text
src/
├── admin/       # Admin dashboard route
├── api/         # Admin/store API routes and middleware
├── modules/     # Support ticket module, models, migrations
├── subscribers/ # Discord + SSE notifications
└── workflows/   # Reserved for future workflow logic
```

## Development

```bash
pnpm build
```

## License

MIT
