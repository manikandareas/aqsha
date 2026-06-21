import { bigint, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/** Per-day feature-count (sinkron `CreditFeature`; sandbox_compute/citation_verify opsional pada row lama). */
export type FeatureCounts = {
  normal_chat: number;
  pro_chat: number;
  cited_answer: number;
  deep_research: number;
  external_search: number;
  sandbox_compute?: number;
  citation_verify?: number;
};

/**
 * usage_daily_rollup — agregat usage per (owner, UTC day) (port V1
 * `usageDailyRollup`). Di-bump ATOMIK di transaksi yang sama dengan insert ledger
 * (denormalisasi derived aggregate). unique (owner, date) → by_owner_date untuk
 * range-scan kronologis (date "YYYY-MM-DD" sort leksikografis == kronologis).
 */
export const usageDailyRollup = pgTable(
  "usage_daily_rollup",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId),
    date: text("date").notNull(),
    credits: bigint("credits", { mode: "number" }).notNull().default(0),
    estimatedCostCents: bigint("estimated_cost_cents", { mode: "number" }).notNull().default(0),
    eventCount: integer("event_count").notNull().default(0),
    featureCounts: jsonb("feature_counts").$type<FeatureCounts>().notNull(),
  },
  (t) => [uniqueIndex("usage_daily_rollup_by_owner_date").on(t.ownerUserId, t.date)],
);

export type UsageDailyRollupRow = typeof usageDailyRollup.$inferSelect;
export type NewUsageDailyRollupRow = typeof usageDailyRollup.$inferInsert;

/** Objek feature-count baru ter-zero (semua 7 feature). Baru tiap call → caller boleh mutasi. */
export function emptyFeatureCounts(): Required<FeatureCounts> {
  return {
    normal_chat: 0,
    pro_chat: 0,
    cited_answer: 0,
    deep_research: 0,
    external_search: 0,
    sandbox_compute: 0,
    citation_verify: 0,
  };
}

/** Normalisasi feature-count (coalesce key opsional → 0) untuk read path. */
export function normalizeFeatureCounts(counts: FeatureCounts | null | undefined): Required<FeatureCounts> {
  return {
    normal_chat: counts?.normal_chat ?? 0,
    pro_chat: counts?.pro_chat ?? 0,
    cited_answer: counts?.cited_answer ?? 0,
    deep_research: counts?.deep_research ?? 0,
    external_search: counts?.external_search ?? 0,
    sandbox_compute: counts?.sandbox_compute ?? 0,
    citation_verify: counts?.citation_verify ?? 0,
  };
}
