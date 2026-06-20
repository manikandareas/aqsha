import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text } from "drizzle-orm/pg-core";
import { artifacts } from "./artifacts";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * artifact_extractions — 1:N job-log provenance ekstraksi teks (P3). TANPA GROBID:
 * `extractor` ∈ pdf_text|docx_text|url_reader. Ditulis pipeline finalizeUpload +
 * url-ingestion sebagai audit trail + dasar retry (read surface menyusul).
 */
export const artifactExtractions = pgTable(
  "artifact_extractions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id),
    workspaceId: text("workspace_id").references(() => workspaces.id),
    extractor: text("extractor").notNull(),
    status: text("status").notNull(),
    failureReason: text("failure_reason"),
    startedAt: bigint("started_at", { mode: "number" }),
    completedAt: bigint("completed_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check(
      "artifact_extractions_extractor_check",
      sql`${t.extractor} in ('pdf_text', 'docx_text', 'url_reader')`,
    ),
    check(
      "artifact_extractions_status_check",
      sql`${t.status} in ('pending', 'running', 'ready', 'failed')`,
    ),
    index("artifact_extractions_by_owner_artifact_extractor").on(
      t.ownerUserId,
      t.artifactId,
      t.extractor,
    ),
  ],
);

export type ArtifactExtraction = typeof artifactExtractions.$inferSelect;
export type NewArtifactExtraction = typeof artifactExtractions.$inferInsert;
