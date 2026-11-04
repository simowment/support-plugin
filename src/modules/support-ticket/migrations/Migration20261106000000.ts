import { Migration } from '@medusajs/framework/mikro-orm/migrations'

export class Migration20261106000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "ticket_outbound_email_draft" (
      "id" text primary key, "ticket_id" text not null, "body" text not null, "revision" integer not null default 1,
      "status" text not null default 'draft', "recipient_email" text not null,
      "subject" text not null, "frozen_payload" jsonb null, "idempotency_key" text null,
      "email_queue_id" text null, "sent_by" text null,
      "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null
    );`)
    this.addSql(
      `create index if not exists "IDX_ticket_outbound_email_ticket" on "ticket_outbound_email_draft" ("ticket_id");`,
    )
    this.addSql(
      `create unique index if not exists "IDX_ticket_outbound_email_idempotency" on "ticket_outbound_email_draft" ("idempotency_key") where "idempotency_key" is not null;`,
    )
  }
  override async down(): Promise<void> {
    // Preserve draft and delivery history on rollback.
  }
}
