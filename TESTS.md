# Support Tickets Plugin Test Specifications

This document outlines the test requirements for the Medusa Support Tickets Plugin.

## 1. Ticket Creation
- **Objective**: Verify that customers and admins can create support tickets.
- **Test Cases**:
    - [ ] Create a ticket from the storefront as a logged-in customer.
    - [ ] Create a ticket as a guest (if supported).
    - [ ] Create a ticket from the admin dashboard.
    - [ ] Verify required fields (subject, message, priority).

## 2. Ticket Update
- **Objective**: Verify that tickets can be modified and responded to.
- **Test Cases**:
    - [ ] Admin adds a message/response to a ticket.
    - [ ] Customer adds a reply to their own ticket.
    - [ ] Update ticket status (e.g., Open -> Pending -> Resolved).
    - [ ] Update ticket priority and category.

## 3. Ticket Deletion
- **Objective**: Verify that tickets can be removed by authorized users.
- **Test Cases**:
    - [ ] Admin deletes a ticket.
    - [ ] Verify that deleted tickets are no longer accessible via API or Dashboard.
    - [ ] Check for proper cleanup of associated messages/attachments.

---
**Existing Tests**:
- `tests/e2e/support-tickets.spec.ts`
