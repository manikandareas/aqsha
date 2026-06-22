import { bigint, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * billing_credit_periods — counter kuota bulanan per owner (port V1
 * `billingCreditPeriods`). Counter MUTABLE (`credits_used`/`estimated_cost_cents`)
 * di-increment ATOMIK dalam transaksi `consumeCredits` dengan row-lock (SELECT …
 * FOR UPDATE) — cermin atomisitas satu-mutation Convex V1.
 *
 * - unique (owner, period_key) → satu baris per bulan ("YYYY-MM").
 * - `credits_limit`/`spend_ceiling_cents` BIGINT karena admin = MAX_SAFE_INTEGER
 *   (> int4). `credits_used`/`estimated_cost_cents` bigint demi konsistensi akumulator.
 */
export const billingCreditPeriods = pgTable(
  "billing_credit_periods",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    periodKey: text("period_key").notNull(),
    planKey: text("plan_key").notNull(),
    status: text("status").notNull(),
    creditsLimit: bigint("credits_limit", { mode: "number" }).notNull(),
    creditsUsed: bigint("credits_used", { mode: "number" }).notNull().default(0),
    estimatedCostCents: bigint("estimated_cost_cents", { mode: "number" }).notNull().default(0),
    spendCeilingCents: bigint("spend_ceiling_cents", { mode: "number" }).notNull(),
    startedAt: bigint("started_at", { mode: "number" }).notNull(),
    resetAt: bigint("reset_at", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [uniqueIndex("billing_credit_periods_by_owner_period").on(t.ownerUserId, t.periodKey)],
);

export type BillingCreditPeriod = typeof billingCreditPeriods.$inferSelect;
export type NewBillingCreditPeriod = typeof billingCreditPeriods.$inferInsert;
