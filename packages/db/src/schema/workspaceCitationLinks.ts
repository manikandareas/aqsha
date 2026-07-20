import { bigint, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { citations } from "./citations";
import { workspaces } from "./workspaces";

/**
 * workspace_citation_links — koleksi sumber per proyek: proyek me-reference item
 * perpustakaan akun (bukan menyalin). Semua link level proyek (satu dokumen kontinu).
 */
export const workspaceCitationLinks = pgTable(
  "workspace_citation_links",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    citationId: text("citation_id")
      .notNull()
      .references(() => citations.id, { onDelete: "cascade" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("workspace_citation_links_ws_citation").on(t.workspaceId, t.citationId),
    index("workspace_citation_links_by_citation").on(t.citationId),
  ],
);

export type WorkspaceCitationLink = typeof workspaceCitationLinks.$inferSelect;
export type NewWorkspaceCitationLink = typeof workspaceCitationLinks.$inferInsert;
