import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { artifacts } from "./artifacts";
import { workspaces } from "./workspaces";

export const SECTION_STATUSES = ["empty", "draft", "in_review", "done"] as const;
export type SectionStatus = (typeof SECTION_STATUSES)[number];

/**
 * workspace_sections — kerangka bab sebuah proyek karya tulis. Template per kind
 * hanya menyemai judul awal; setelah itu baris sepenuhnya milik user
 * (rename/tambah/hapus/reorder).
 *
 * - `role='bibliography'` = section Daftar Pustaka; kontennya digenerate citeproc
 *   dari sitasi terpakai, bukan dokumen DOCX yang diedit.
 * - `document_artifact_id` lazy — baru dibuat saat bab pertama kali ditulis.
 */
export const workspaceSections = pgTable(
  "workspace_sections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sortOrder: integer("sort_order").notNull(),
    status: text("status").notNull().default("empty"),
    role: text("role"),
    documentArtifactId: text("document_artifact_id").references(() => artifacts.id),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check(
      "workspace_sections_status_check",
      sql`${t.status} in ('empty', 'draft', 'in_review', 'done')`,
    ),
    check("workspace_sections_role_check", sql`${t.role} is null or ${t.role} in ('bibliography')`),
    index("workspace_sections_by_workspace_order").on(t.workspaceId, t.sortOrder),
  ],
);

export type WorkspaceSection = typeof workspaceSections.$inferSelect;
export type NewWorkspaceSection = typeof workspaceSections.$inferInsert;
