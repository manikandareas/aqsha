import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * provider_usage_ledger — satu baris per credit-consuming event (port V1
 * `providerUsageLedger`). Append-only; di-insert dalam transaksi `consumeCredits`
 * yang sama dengan debit period + rollup.
 *
 * - `feature` text + CHECK (7 feature, sinkron `CreditFeature`).
 * - `metadata` jsonb (ganti `metadataJson` string V1).
 * - idempotency UNIQUE per-OWNER (owner_user_id, idempotency_key) partial (where
 *   key not null) → A9: step yang re-run saat resume durable tak double-debit. Scoped
 *   per-owner supaya key bentrok lintas-owner tak menelan charge owner lain.
 *   Insert on-conflict-do-nothing dicek di tx yang sama SEBELUM debit.
 * - index by_owner_feature_created (owner, feature, created_at) → cap deep_research
 *   per-period (count window startedAt..resetAt).
 */
export const providerUsageLedger = pgTable(
  "provider_usage_ledger",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    threadId: text("thread_id"),
    feature: text("feature").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    credits: bigint("credits", { mode: "number" }).notNull(),
    estimatedCostCents: bigint("estimated_cost_cents", { mode: "number" }).notNull(),
    metadata: jsonb("metadata"),
    idempotencyKey: text("idempotency_key"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check(
      "provider_usage_ledger_feature_check",
      sql`${t.feature} in ('normal_chat', 'pro_chat', 'cited_answer', 'deep_research', 'external_search', 'sandbox_compute', 'citation_verify', 'doc_ai_edit')`,
    ),
    uniqueIndex("provider_usage_ledger_by_owner_idempotency_key")
      .on(t.ownerUserId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index("provider_usage_ledger_by_owner_feature_created").on(
      t.ownerUserId,
      t.feature,
      t.createdAt,
    ),
  ],
);

export type ProviderUsageLedgerRow = typeof providerUsageLedger.$inferSelect;
export type NewProviderUsageLedgerRow = typeof providerUsageLedger.$inferInsert;
