import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { artifacts } from "./artifacts";
import { users } from "./users";

export const DOCUMENT_REVISION_AUTHORS = ["user", "agent", "system"] as const;
export type DocumentRevisionAuthor = (typeof DOCUMENT_REVISION_AUTHORS)[number];

/**
 * document_revisions — jejak revisi sumber LaTeX per artifact dokumen (append-only,
 * retensi terbatas oleh service). Jaring pengaman pemulihan + basis three-way merge
 * saat stale_write (client memegang baseVersion N bisa meminta revisi N sebagai base
 * merge). Bukan riwayat versi user-facing.
 */
export const documentRevisions = pgTable(
  "document_revisions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    source: text("source").notNull(),
    author: text("author").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("document_revisions_author_check", sql`${t.author} in ('user', 'agent', 'system')`),
    uniqueIndex("document_revisions_by_artifact_version").on(t.artifactId, t.version),
    index("document_revisions_by_owner_artifact").on(t.ownerUserId, t.artifactId),
  ],
);

export type DocumentRevision = typeof documentRevisions.$inferSelect;
export type NewDocumentRevision = typeof documentRevisions.$inferInsert;
