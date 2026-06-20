import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, real, text } from "drizzle-orm/pg-core";
import { artifacts } from "./artifacts";
import { users } from "./users";
import { workspaces } from "./workspaces";

export type PaperAuthor = { name: string; affiliation?: string };

/**
 * artifact_paper_metadata — 1:1 metadata bibliografi paper (P3). Hanya ada untuk
 * artifact workspace-scoped (upload PDF / url paper) → `workspace_id` NON-null.
 * `metadata_source` TANPA grobid; rank monotonik manual>resolver>llm ditegakkan di
 * `PaperMetadataService.upsert`. Kolom GROBID (tei/sections/references storage) di-drop.
 */
export const artifactPaperMetadata = pgTable(
  "artifact_paper_metadata",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    title: text("title"),
    abstract: text("abstract"),
    doi: text("doi"),
    authors: jsonb("authors").$type<PaperAuthor[]>(),
    affiliations: text("affiliations").array(),
    journal: text("journal"),
    publisher: text("publisher"),
    publishedYear: integer("published_year"),
    keywords: text("keywords").array(),
    metadataSource: text("metadata_source").notNull(),
    arxivId: text("arxiv_id"),
    sourceUrl: text("source_url"),
    oaStatus: text("oa_status"),
    pdfStatus: text("pdf_status"),
    confidence: real("confidence"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check(
      "artifact_paper_metadata_metadata_source_check",
      sql`${t.metadataSource} in ('crossref', 'openalex', 'arxiv', 'datacite', 'semantic_scholar', 'manual', 'llm')`,
    ),
    check(
      "artifact_paper_metadata_pdf_status_check",
      sql`${t.pdfStatus} is null or ${t.pdfStatus} in ('downloaded', 'no_oa_available')`,
    ),
    index("artifact_paper_metadata_by_owner_artifact").on(t.ownerUserId, t.artifactId),
    index("artifact_paper_metadata_by_owner_workspace_updated").on(
      t.ownerUserId,
      t.workspaceId,
      t.updatedAt,
    ),
    index("artifact_paper_metadata_by_owner_doi").on(t.ownerUserId, t.doi),
  ],
);

export type ArtifactPaperMetadata = typeof artifactPaperMetadata.$inferSelect;
export type NewArtifactPaperMetadata = typeof artifactPaperMetadata.$inferInsert;
