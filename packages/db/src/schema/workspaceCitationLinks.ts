import { bigint, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { citations } from "./citations";
import { workspaces } from "./workspaces";
import { workspaceSections } from "./workspaceSections";

/**
 * workspace_citation_links — koleksi sumber per proyek: proyek me-reference item
 * perpustakaan akun (bukan menyalin). `section_id` menandai sumber untuk bab
 * tertentu; null = level proyek.
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
    sectionId: text("section_id").references(() => workspaceSections.id, {
      onDelete: "set null",
    }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("workspace_citation_links_ws_citation").on(t.workspaceId, t.citationId),
    index("workspace_citation_links_by_section").on(t.sectionId),
    index("workspace_citation_links_by_citation").on(t.citationId),
  ],
);

export type WorkspaceCitationLink = typeof workspaceCitationLinks.$inferSelect;
export type NewWorkspaceCitationLink = typeof workspaceCitationLinks.$inferInsert;
