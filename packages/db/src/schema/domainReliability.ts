import { bigint, boolean, index, integer, pgTable, text } from "drizzle-orm/pg-core";

/**
 * domain_reliability — skor keandalan domain publisher. Port skema V1 `domainReliability`.
 * PARITY-ONLY di P4: tabel dibuat tapi BELUM di-tulis/baca lane mana pun (lane enrichment V1
 * pun tak menyentuhnya — recordOutcome/skip-domain ada di jalur agent research, P6/P7). PK =
 * `domain` (natural key); di-wire saat jalur agent membutuhkannya.
 */
export const domainReliability = pgTable(
  "domain_reliability",
  {
    domain: text("domain").primaryKey(),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    unreliable: boolean("unreliable"),
    lastFailureReason: text("last_failure_reason"),
    lastSeenAt: bigint("last_seen_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [index("domain_reliability_by_unreliable").on(t.unreliable)],
);

export type DomainReliability = typeof domainReliability.$inferSelect;
export type NewDomainReliability = typeof domainReliability.$inferInsert;
