import { Migration } from '@medusajs/framework/mikro-orm/migrations'

export class Migration20261105000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "ticket_inbound_email_receipt" add column if not exists "provider_token_hash" text null;`,
    )
    this.addSql(
      `alter table "ticket_inbound_email_receipt" add column if not exists "payload_hash" text null;`,
    )
    this.addSql(
      `create unique index if not exists "IDX_ticket_inbound_email_provider_token_hash" on "ticket_inbound_email_receipt" ("provider_token_hash");`,
    )
  }

  override async down(): Promise<void> {
    // Keep replay-protection metadata during rollback so old receipts remain
    // distinguishable from future signed-provider retries.
  }
}
