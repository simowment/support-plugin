import { Migration } from '@medusajs/framework/mikro-orm/migrations'

export class Migration20260608000000 extends Migration {
  override async up(): Promise<void> {
    // ticket — core support ticket
    this.addSql(
      `create table if not exists "ticket" (
        "id" text not null,
        "subject" text not null,
        "category" text not null,
        "status" text not null default 'open',
        "customer_id" text not null,
        "assigned_to" text null,
        "order_id" text null,
        "closed_at" timestamptz null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "ticket_pkey" primary key ("id")
      );`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_ticket_deleted_at" ON "ticket" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_ticket_customer_id_status" ON "ticket" ("customer_id", "status") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_ticket_assigned_to" ON "ticket" ("assigned_to") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_ticket_order_id" ON "ticket" ("order_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_ticket_status" ON "ticket" ("status") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_ticket_category" ON "ticket" ("category") WHERE deleted_at IS NULL;`,
    )

    // ticket_message — messages on a ticket
    this.addSql(
      `create table if not exists "ticket_message" (
        "id" text not null,
        "ticket_id" text not null,
        "sender_type" text not null,
        "sender_id" text null,
        "message" text not null,
        "attachments" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "ticket_message_pkey" primary key ("id")
      );`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_ticket_message_deleted_at" ON "ticket_message" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_ticket_message_ticket_id" ON "ticket_message" ("ticket_id") WHERE deleted_at IS NULL;`,
    )

    // ticket_event — event log for a ticket
    this.addSql(
      `create table if not exists "ticket_event" (
        "id" text not null,
        "ticket_id" text not null,
        "event_type" text not null,
        "data" jsonb null,
        "performed_by_type" text null,
        "performed_by_id" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "ticket_event_pkey" primary key ("id")
      );`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_ticket_event_deleted_at" ON "ticket_event" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_ticket_event_ticket_id" ON "ticket_event" ("ticket_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_ticket_event_event_type" ON "ticket_event" ("event_type") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "ticket_event" cascade;`)
    this.addSql(`drop table if exists "ticket_message" cascade;`)
    this.addSql(`drop table if exists "ticket" cascade;`)
  }
}
