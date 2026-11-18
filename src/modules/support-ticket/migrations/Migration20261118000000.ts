import { Migration } from '@medusajs/framework/mikro-orm/migrations'

/** Settings the owner changes in Support inbox > Settings (key/value, no secrets). */
export class Migration20261118000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "support_ticket_setting" (
      "id" text not null, "key" text not null, "value" text not null,
      "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "support_ticket_setting_pkey" primary key ("id")
    );`)
    this.addSql(
      `create unique index if not exists "IDX_support_ticket_setting_key" on "support_ticket_setting" ("key") where "deleted_at" is null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "support_ticket_setting" cascade;`)
  }
}
