import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * billing_subscriptions — mirror langganan provider (SoT fallback snapshot saat
 * live provider tak tersedia). Ditulis oleh `syncSubscriptionFromMayar` (webhook).
 * Hanya plan BERBAYAR yang di-mirror (free/admin ditolak di sync) → CHECK plan_key
 * in (starter, plus, ultra).
 *
 * - `provider_subscription_id` unique → upsert by-subscription idempotent. Mayar
 *   tak memberi subscription id → synthetic `mayar:${productId}:${customerEmail}`.
 * - `raw_json` jsonb = payload provider mentah (audit / re-derive).
 */
export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    providerProductId: text("provider_product_id").notNull(),
    productKey: text("product_key"),
    planKey: text("plan_key").notNull(),
    billingInterval: text("billing_interval").notNull(),
    status: text("status").notNull(),
    currentPeriodStart: bigint("current_period_start", { mode: "number" }),
    currentPeriodEnd: bigint("current_period_end", { mode: "number" }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end"),
    canceledAt: bigint("canceled_at", { mode: "number" }),
    rawJson: jsonb("raw_json"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("billing_subscriptions_plan_check", sql`${t.planKey} in ('starter', 'plus', 'ultra')`),
    check("billing_subscriptions_interval_check", sql`${t.billingInterval} in ('month', 'year')`),
    uniqueIndex("billing_subscriptions_by_provider").on(t.providerSubscriptionId),
    index("billing_subscriptions_by_owner_updated").on(t.ownerUserId, t.updatedAt),
  ],
);

export type BillingSubscription = typeof billingSubscriptions.$inferSelect;
export type NewBillingSubscription = typeof billingSubscriptions.$inferInsert;
