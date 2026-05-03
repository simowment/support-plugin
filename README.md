# Medusa Support Tickets Plugin

A custom Medusa v2 plugin for handling customer support inquiries, returns, and fulfillment issues.

## Overview
This plugin provides a dedicated ticketing system within the commerce platform, allowing customers to communicate with store administrators regarding their orders, and providing admins with the context they need to resolve issues efficiently.

## Planned Features
- **Ticket Management**: Create, update, and resolve support tickets.
- **Order Linking**: Tie tickets directly to specific orders, fulfillments, or customers.
- **Messaging**: Bi-directional communication between staff and customers.
- **AI Assistance**: Planned support for AI-drafted replies and issue classification.
- **Event Tracking**: Audit trail of ticket status changes and escalations.

## Usage in Backend
This plugin is designed to be loaded via `medusa-config.ts` in the main backend application.

## Development
- Ensure models (`ticket`, `ticket_message`, `ticket_event`) are properly linked without circular dependencies.
- Any database changes require generating new migrations in the backend context.

Refer to `ecomskill/ai_customer_support.md` for guidelines on AI-assisted support workflows and escalation policies.
