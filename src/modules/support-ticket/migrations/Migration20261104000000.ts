import { Migration } from '@medusajs/framework/mikro-orm/migrations'

export class Migration20261104000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "ticket" alter column "customer_id" drop not null;`)
    this.addSql(`alter table "ticket" add column if not exists "contact_email" text null;`)
    this.addSql(`alter table "ticket" add column if not exists "contact_name" text null;`)

    this.addSql(`
      create table if not exists "ticket_inbound_email_receipt" (
        "id" text not null,
        "recipient_email" text not null,
        "message_id" text not null,
        "sender_email" text not null,
        "ticket_id" text null,
        "ticket_message_id" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "ticket_inbound_email_receipt_pkey" primary key ("id"),
        constraint "ticket_inbound_email_receipt_ticket_fk" foreign key ("ticket_id") references "ticket" ("id") on delete set null,
        constraint "ticket_inbound_email_receipt_message_fk" foreign key ("ticket_message_id") references "ticket_message" ("id") on delete set null
      );
    `)
    this.addSql(`
      create unique index if not exists "IDX_ticket_inbound_email_dedup"
      on "ticket_inbound_email_receipt" ("recipient_email", "message_id");
    `)

    this.addSql(`
      create table if not exists "ticket_email_reply_token" (
        "id" text not null,
        "token_hash" text not null,
        "expected_sender_email" text not null,
        "ticket_id" text not null,
        "revoked_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "ticket_email_reply_token_pkey" primary key ("id"),
        constraint "ticket_email_reply_token_ticket_fk" foreign key ("ticket_id") references "ticket" ("id") on delete cascade
      );
    `)
    this.addSql(`
      create unique index if not exists "IDX_ticket_email_reply_token_hash"
      on "ticket_email_reply_token" ("token_hash");
    `)
    this.addSql(`
      create index if not exists "IDX_ticket_email_reply_token_ticket"
      on "ticket_email_reply_token" ("ticket_id");
    `)
  }

  override async down(): Promise<void> {
    // Guest tickets, message dedup receipts, and reply-token bindings may now
    // contain live support history. Preserve them during rollback.
  }
}
