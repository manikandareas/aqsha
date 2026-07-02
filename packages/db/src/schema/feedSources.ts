import { bigint, boolean, check, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * feed_sources — registry lane hydration. Port skema V1 `feedSources`. PARITY-ONLY di P4:
 * lane `feed-hydration` memakai seed-array KONSTAN di kode (lihat FeedHydrationService), bukan
 * baris tabel ini — tabel BELUM dibaca/ditulis di mana pun (introspeksi cadence/last-run = ops
 * follow-up). provider lowercase (sama feed_items).
 */
export const feedSources = pgTable(
  "feed_sources",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    label: text("label").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    cadenceMinutes: integer("cadence_minutes").notNull(),
    queryParamsJson: text("query_params_json"),
    lastRunAt: bigint("last_run_at", { mode: "number" }),
    lastStatus: text("last_status"),
    lastFailureReason: text("last_failure_reason"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check(
      "feed_sources_provider_check",
      sql`${t.provider} in ('openalex', 'exa_news', 'gdelt', 'google_factcheck', 'turnbackhoax')`,
    ),
    check(
      "feed_sources_last_status_check",
      sql`${t.lastStatus} is null or ${t.lastStatus} in ('ready', 'empty', 'failed')`,
    ),
    index("feed_sources_by_provider").on(t.provider),
  ],
);

export type FeedSource = typeof feedSources.$inferSelect;
export type NewFeedSource = typeof feedSources.$inferInsert;
