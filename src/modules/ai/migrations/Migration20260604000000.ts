import { Migration } from '@medusajs/framework/mikro-orm/migrations'

export class Migration20260604000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "ai_setting" ("id" text not null, "key" text not null, "value" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ai_setting_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ai_setting_key" ON "ai_setting" ("key") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `create table if not exists "ai_ticket_analysis" ("id" text not null, "ticket_id" text not null, "category" text null, "category_confidence" double precision null, "suggested_priority" text null, "priority_confidence" double precision null, "sentiment_score" double precision null, "urgency_score" double precision null, "auto_replied" boolean not null default false, "auto_reply_eligible" boolean not null default false, "auto_replied_at" timestamptz null, "suggested_response" text null, "response_confidence" double precision null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ai_ticket_analysis_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_ai_ticket_analysis_ticket_id" ON "ai_ticket_analysis" ("ticket_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `ALTER TABLE "ai_ticket_analysis" ADD COLUMN IF NOT EXISTS "auto_reply_eligible" boolean not null default false;`,
    )
    this.addSql(
      `ALTER TABLE "ai_ticket_analysis" ADD COLUMN IF NOT EXISTS "auto_replied_at" timestamptz null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "ai_setting" cascade;`)
    this.addSql(`drop table if exists "ai_ticket_analysis" cascade;`)
  }
}
