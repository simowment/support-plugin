import { Migration } from '@medusajs/framework/mikro-orm/migrations'

export class Migration20260506000001 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "ticket_note" ("id" text not null, "ticket_id" text not null, "content" text not null, "author_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ticket_note_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_ticket_note_ticket_id" ON "ticket_note" ("ticket_id") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "ticket_note" cascade;`)
  }
}
