import { Migration } from '@medusajs/framework/mikro-orm/migrations'

export class Migration20260614000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `delete from "ticket_note" tn where not exists (select 1 from "ticket" t where t."id" = tn."ticket_id");`,
    )
    this.addSql(
      `alter table "ticket_note" add constraint "ticket_note_ticket_id_foreign" foreign key ("ticket_id") references "ticket" ("id") on delete cascade;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "ticket_note" drop constraint if exists "ticket_note_ticket_id_foreign";`,
    )
  }
}
