import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { artifacts } from "./artifacts";
import { users } from "./users";

/** Author CSL-style — `literal` untuk corporate author, else family/given. */
export type CitationAuthor = { family?: string; given?: string; literal?: string };

export type CitationSource = "import" | "provider_sync" | "artifact" | "doi" | "manual";
export type CitationProvider = "mendeley" | "zotero";
export type CitationMetadataStatus = "verified" | "needs_review" | "incomplete";

/**
 * citations — perpustakaan referensi global per akun. Koleksi per proyek hidup di
 * `workspace_citation_links` (proyek me-reference item, bukan menyalin), sehingga
 * satu sumber bisa dipakai lintas karya tulis tanpa duplikat.
 * Entitas terpisah dari `artifact_paper_metadata` (referensi bisa tanpa file,
 * satu referensi dipakai banyak dokumen) dan `research_sources` (thread-scoped).
 * `csl_json` = canonical record; kolom read-model diturunkan darinya utk query/index.
 * Soft delete via `deleted_at` supaya usage dokumen tetap terdiagnosis.
 */
export const citations = pgTable(
  "citations",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    artifactId: text("artifact_id").references(() => artifacts.id),
    source: text("source").notNull(),
    provider: text("provider"),
    externalId: text("external_id"),
    documentType: text("document_type").notNull(),
    title: text("title").notNull(),
    authorsJson: jsonb("authors_json").$type<CitationAuthor[]>().notNull(),
    publishedYear: integer("published_year"),
    venue: text("venue"),
    publisher: text("publisher"),
    doi: text("doi"),
    url: text("url"),
    tags: text("tags").array().notNull(),
    cslJson: jsonb("csl_json").notNull(),
    canonicalKey: text("canonical_key").notNull(),
    // Kunci \cite{} persisten: di-assign sekali (lazy) lalu beku — kunci yang tertanam
    // di sumber LaTeX tidak boleh bergeser saat himpunan perpustakaan berubah.
    bibKey: text("bib_key"),
    metadataStatus: text("metadata_status").notNull(),
    reviewedAt: bigint("reviewed_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
  },
  (t) => [
    check(
      "citations_source_check",
      sql`${t.source} in ('import', 'provider_sync', 'artifact', 'doi', 'manual')`,
    ),
    check(
      "citations_provider_check",
      sql`${t.provider} is null or ${t.provider} in ('mendeley', 'zotero')`,
    ),
    check(
      "citations_metadata_status_check",
      sql`${t.metadataStatus} in ('verified', 'needs_review', 'incomplete')`,
    ),
    index("citations_by_owner_updated").on(t.ownerUserId, t.updatedAt),
    index("citations_by_owner_doi").on(t.ownerUserId, t.doi),
    index("citations_by_owner_canonical").on(t.ownerUserId, t.canonicalKey),
    index("citations_by_owner_artifact").on(t.ownerUserId, t.artifactId),
    uniqueIndex("citations_by_owner_bib_key")
      .on(t.ownerUserId, t.bibKey)
      .where(sql`${t.bibKey} is not null`),
    uniqueIndex("citations_by_owner_external")
      .on(t.ownerUserId, t.provider, t.externalId)
      .where(sql`${t.externalId} is not null`),
  ],
);

export type Citation = typeof citations.$inferSelect;
export type NewCitation = typeof citations.$inferInsert;
