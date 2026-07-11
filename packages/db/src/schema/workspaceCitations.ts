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
import { workspaces } from "./workspaces";

/** Author CSL-style — `literal` untuk corporate author, else family/given. */
export type CitationAuthor = { family?: string; given?: string; literal?: string };

export type CitationSource = "import" | "provider_sync" | "artifact" | "doi" | "manual";
export type CitationProvider = "mendeley" | "zotero";
export type CitationMetadataStatus = "verified" | "needs_review" | "incomplete";

/**
 * workspace_citations — Citation Library workspace-scoped (Citation Manager Fase 1).
 * Entitas baru terpisah dari `artifact_paper_metadata` (referensi bisa tanpa file,
 * satu referensi dipakai banyak dokumen) dan `research_sources` (thread-scoped).
 * `csl_json` = canonical record; kolom read-model diturunkan darinya utk query/index.
 * Soft delete via `deleted_at` supaya usage dokumen (Fase 3) tetap terdiagnosis.
 */
export const workspaceCitations = pgTable(
  "workspace_citations",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
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
    metadataStatus: text("metadata_status").notNull(),
    reviewedAt: bigint("reviewed_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
    deletedAt: bigint("deleted_at", { mode: "number" }),
  },
  (t) => [
    check(
      "workspace_citations_source_check",
      sql`${t.source} in ('import', 'provider_sync', 'artifact', 'doi', 'manual')`,
    ),
    check(
      "workspace_citations_provider_check",
      sql`${t.provider} is null or ${t.provider} in ('mendeley', 'zotero')`,
    ),
    check(
      "workspace_citations_metadata_status_check",
      sql`${t.metadataStatus} in ('verified', 'needs_review', 'incomplete')`,
    ),
    index("workspace_citations_by_owner_workspace_updated").on(
      t.ownerUserId,
      t.workspaceId,
      t.updatedAt,
    ),
    index("workspace_citations_by_owner_workspace_doi").on(t.ownerUserId, t.workspaceId, t.doi),
    index("workspace_citations_by_owner_workspace_canonical").on(
      t.ownerUserId,
      t.workspaceId,
      t.canonicalKey,
    ),
    index("workspace_citations_by_owner_artifact").on(t.ownerUserId, t.artifactId),
    uniqueIndex("workspace_citations_by_owner_workspace_external")
      .on(t.ownerUserId, t.workspaceId, t.provider, t.externalId)
      .where(sql`${t.externalId} is not null`),
  ],
);

export type WorkspaceCitation = typeof workspaceCitations.$inferSelect;
export type NewWorkspaceCitation = typeof workspaceCitations.$inferInsert;
