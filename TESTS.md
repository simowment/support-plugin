# Support Tickets Plugin Test Specifications

This document outlines the test requirements for the Medusa Support Tickets Plugin.

## 1. Customer Ticket Creation

- **Objective**: Verify that authenticated customers can create support tickets.
- **Test Cases**:
  - [ ] Create a ticket from the storefront as a logged-in customer (POST `/store/tickets`).
  - [ ] Verify required fields (subject, message, category).
  - [ ] Verify ticket is created with status `open` and linked to the authenticated customer.
  - [ ] Verify that unauthenticated requests are rejected.

## 2. Customer Messaging

- **Objective**: Verify that customers can reply to their own tickets.
- **Test Cases**:
  - [ ] Customer adds a reply to their own ticket (POST `/store/tickets/:id/messages`).
  - [ ] Verify ownership check — customer cannot reply to another customer's ticket.
  - [ ] Verify message appears in ticket with sender type `customer`.

## 3. Admin Ticket Management

- **Objective**: Verify admin can update, reply to, and delete tickets.
- **Test Cases**:
  - [ ] Admin adds a message/response to a ticket (POST `/admin/tickets/:id/messages`).
  - [ ] Admin updates ticket status (POST `/admin/tickets/:id`) — e.g. `open` → `in_progress` → `closed`.
  - [ ] Admin assigns ticket to a staff member.
  - [ ] Admin deletes a ticket (DELETE `/admin/tickets/:id`).
  - [ ] Verify deleted tickets are no longer accessible via API or Dashboard.
  - [ ] Check for proper cleanup of associated messages and events.

## 4. Internal Notes

- **Objective**: Verify admin-only internal notes.
- **Test Cases**:
  - [ ] Admin adds an internal note (POST `/admin/tickets/:id/notes`).
  - [ ] Admin lists notes (GET `/admin/tickets/:id/notes`).
  - [ ] Verify notes are **not** visible via store API.

## 5. Ticket Merging

- **Objective**: Verify admin can merge duplicate tickets (same customer only).
- **Test Cases**:
  - [ ] Admin merges source ticket into target ticket (POST `/admin/tickets/:id/merge`).
  - [ ] Verify messages and notes from source are migrated to target.
  - [ ] Verify merge creates audit events on both tickets.
  - [ ] Verify merging tickets from different customers is rejected.

## 6. Bulk Operations

- **Objective**: Verify admin can update multiple tickets at once.
- **Test Cases**:
  - [ ] Admin performs bulk status update (POST `/admin/tickets/bulk`).
  - [ ] Admin performs bulk assignment update.
  - [ ] Verify only valid tickets are updated; invalid IDs are reported.

## 7. AI Settings & Analysis

- **Objective**: Verify AI configuration and per-ticket analysis.
- **Test Cases**:
  - [ ] Admin fetches AI settings (GET `/admin/tickets/ai-settings`).
  - [ ] Admin updates AI settings — provider, model, prompts, enabled flags (POST `/admin/tickets/ai-settings`).
  - [ ] Admin triggers on-demand AI analysis for a ticket (POST `/admin/tickets/:id/ai`).
  - [ ] Admin retrieves AI analysis results (GET `/admin/tickets/:id/ai`).
  - [ ] Verify auto-reply is triggered when confidence ≥ 0.85 (if enabled).
  - [ ] Verify sensitive categories (refund, payment, fraud, legal) block auto-reply.

## 8. File Attachment Upload

- **Objective**: Verify file upload with MIME validation and size limits.
- **Test Cases**:
  - [ ] Upload valid file types (PNG, JPEG, PDF, CSV, DOCX) via store upload endpoint.
  - [ ] Upload valid file types via admin upload endpoint.
  - [ ] Reject invalid MIME types.
  - [ ] Reject files exceeding 10 MB.
  - [ ] Verify attachment is linked to the ticket message after upload.

## 9. Server-Sent Events

- **Objective**: Verify real-time ticket updates via SSE.
- **Test Cases**:
  - [ ] Customer subscribes to their ticket SSE stream (GET `/store/tickets/:id/events`) — ownership verified.
  - [ ] Admin subscribes to admin SSE stream (GET `/admin/tickets/events`).
  - [ ] Verify heartbeat is sent every 30 seconds.
  - [ ] Verify events are emitted on ticket create, message add, status change, and deletion.

## 10. Notifications

- **Objective**: Verify admin notification indicators.
- **Test Cases**:
  - [ ] Admin fetches unread customer reply count and recent tickets (GET `/admin/tickets/notifications`).
  - [ ] Verify count resets after admin views/replies (read tracking).

---

**Existing Tests**:

- `tests/e2e/support-tickets.spec.ts`
