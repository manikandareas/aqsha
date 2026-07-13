import { sql } from "drizzle-orm";
import { bigint, check, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export type CitationStyleId = "apa-7" | "ieee" | "vancouver" | "chicago-author-date";
export type BibliographySort = "author" | "year" | "title";

/**
 * workspace_citation_settings — preferensi render sitasi one-to-one per workspace
 * (pola PK-is-FK seperti `user_agent_preferences`). Style default me-render ulang
 * seluruh citation/bibliography; dokumen hanya menyimpan `citationId`.
 */
export const workspaceCitationSettings = pgTable(
  "workspace_citation_settings",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => workspaces.id),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    defaultStyleId: text("default_style_id").notNull().default("apa-7"),
    bibliographySort: text("bibliography_sort").notNull().default("author"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check(
      "workspace_citation_settings_default_style_id_check",
      sql`${t.defaultStyleId} in ('apa-7', 'ieee', 'vancouver', 'chicago-author-date')`,
    ),
    check(
      "workspace_citation_settings_bibliography_sort_check",
      sql`${t.bibliographySort} in ('author', 'year', 'title')`,
    ),
  ],
);

export type WorkspaceCitationSettings = typeof workspaceCitationSettings.$inferSelect;
export type NewWorkspaceCitationSettings = typeof workspaceCitationSettings.$inferInsert;
