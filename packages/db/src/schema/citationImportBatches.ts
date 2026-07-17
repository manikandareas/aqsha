import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./users";

export type ImportBatchSourceKind = "file" | "provider_sync";
export type ImportBatchFormat = "bibtex" | "ris";
export type ImportBatchStatus = "pending" | "committed";

/**
 * citation_import_batches — audit + staging batch import (bukan source of truth).
 * Batch milik AKUN (perpustakaan account-level), bukan proyek — import/sync tidak
 * lagi menautkan hasil ke workspace mana pun. `records_json` menahan record hasil
 * parse antara preview → commit, lalu dikosongkan saat commit (raw file tidak
 * dipertahankan). Reused oleh provider sync (Fase 5–6) via `source_kind = 'provider_sync'`.
 */
export const citationImportBatches = pgTable(
  "citation_import_batches",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    sourceKind: text("source_kind").notNull(),
    format: text("format"),
    provider: text("provider"),
    originalFilename: text("original_filename"),
    totalCount: integer("total_count").notNull().default(0),
    validCount: integer("valid_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    status: text("status").notNull().default("pending"),
    recordsJson: jsonb("records_json"),
    summaryJson: jsonb("summary_json"),
    committedAt: bigint("committed_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check(
      "citation_import_batches_source_kind_check",
      sql`${t.sourceKind} in ('file', 'provider_sync')`,
    ),
    check(
      "citation_import_batches_format_check",
      sql`${t.format} is null or ${t.format} in ('bibtex', 'ris')`,
    ),
    check(
      "citation_import_batches_status_check",
      sql`${t.status} in ('pending', 'committed')`,
    ),
    index("citation_import_batches_by_owner_created").on(t.ownerUserId, t.createdAt),
  ],
);

export type CitationImportBatch = typeof citationImportBatches.$inferSelect;
export type NewCitationImportBatch = typeof citationImportBatches.$inferInsert;
