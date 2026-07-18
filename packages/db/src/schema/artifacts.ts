import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaceFolders } from "./workspaceFolders";
import { workspaces } from "./workspaces";

/**
 * artifacts — tabel induk library (P3). Port dari V1 `artifacts`, men-drop kolom
 * legacy (`kind`/`type`/`contentFormat`). 5-table split: side-tables 1:1/1:N FK ke
 * `artifacts.id`.
 *
 * - `workspace_id` NULLABLE → headless (chat-attachment/agent, di-file ke workspace
 *   nanti via linkToWorkspace, P6). `folder_id` opsional.
 * - `storage_r2_key` = blob file ter-upload (PDF/DOCX) → R2 key (ganti `Id<_storage>`).
 * - Enum disimpan text + CHECK. `status` soft-delete (active|deleted).
 * - 5 index `by_owner_*` mirror V1.
 */
export const artifacts = pgTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id),
    folderId: text("folder_id").references(() => workspaceFolders.id),
    threadId: text("thread_id"),
    artifactType: text("artifact_type").notNull(),
    artifactFamily: text("artifact_family").notNull(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    language: text("language"),
    mimeType: text("mime_type"),
    fileName: text("file_name"),
    byteSize: bigint("byte_size", { mode: "number" }),
    indexingStatus: text("indexing_status").notNull().default("not_indexed"),
    indexingFailureReason: text("indexing_failure_reason"),
    detectedDocumentKind: text("detected_document_kind"),
    storageR2Key: text("storage_r2_key"),
    // Versi konten dokumen authored (sumber LaTeX bab): +1 tiap save, guard stale_write.
    // Null untuk artifact non-authored (upload/url/markdown lama).
    contentVersion: integer("content_version"),
    ragEntryId: text("rag_entry_id"),
    plainTextPreview: text("plain_text_preview"),
    indexedAt: bigint("indexed_at", { mode: "number" }),
    status: text("status").notNull().default("active"),
    deletedAt: bigint("deleted_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    // 0028: + 'image' (bug laten — sudah ada di allow-list upload sejak P3 tapi
    // tertinggal dari CHECK) + 'spreadsheet' (upload .xlsx untuk analisis statistik).
    check(
      "artifacts_artifact_type_check",
      sql`${t.artifactType} in ('markdown', 'plain_text', 'pdf', 'docx', 'image', 'spreadsheet', 'html', 'svg', 'mermaid', 'json', 'csv', 'code', 'url', 'latex')`,
    ),
    check(
      "artifacts_artifact_family_check",
      sql`${t.artifactFamily} in ('text', 'file', 'interactive', 'visual', 'data', 'link')`,
    ),
    check("artifacts_source_check", sql`${t.source} in ('manual', 'upload', 'agent', 'url')`),
    check(
      "artifacts_indexing_status_check",
      sql`${t.indexingStatus} in ('not_indexed', 'pending', 'ready', 'failed')`,
    ),
    check(
      "artifacts_detected_document_kind_check",
      sql`${t.detectedDocumentKind} is null or ${t.detectedDocumentKind} in ('generic', 'scholarly_paper')`,
    ),
    check("artifacts_status_check", sql`${t.status} in ('active', 'deleted')`),
    index("artifacts_by_owner_status_updated").on(t.ownerUserId, t.status, t.updatedAt),
    index("artifacts_by_owner_workspace_status_updated").on(
      t.ownerUserId,
      t.workspaceId,
      t.status,
      t.updatedAt,
    ),
    index("artifacts_by_owner_workspace_folder_status_updated").on(
      t.ownerUserId,
      t.workspaceId,
      t.folderId,
      t.status,
      t.updatedAt,
    ),
    index("artifacts_by_owner_thread_created").on(t.ownerUserId, t.threadId, t.createdAt),
    index("artifacts_by_owner_thread_source_status_created").on(
      t.ownerUserId,
      t.threadId,
      t.source,
      t.status,
      t.createdAt,
    ),
  ],
);

export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
