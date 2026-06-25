import { bigint, jsonb, pgTable, text } from "drizzle-orm/pg-core";

/**
 * billing_pending_webhooks — webhook Mayar yang `customerEmail`-nya tak cocok
 * user mana pun (atribusi by-email gagal). Disimpan untuk rekonsiliasi manual
 * (mis. user bayar pakai email berbeda dari akun). TANPA FK ke users (justru
 * karena owner belum diketahui).
 */
export const billingPendingWebhooks = pgTable("billing_pending_webhooks", {
  id: text("id").primaryKey(),
  event: text("event").notNull(),
  customerEmail: text("customer_email"),
  productId: text("product_id"),
  rawJson: jsonb("raw_json"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export type BillingPendingWebhook = typeof billingPendingWebhooks.$inferSelect;
export type NewBillingPendingWebhook = typeof billingPendingWebhooks.$inferInsert;
