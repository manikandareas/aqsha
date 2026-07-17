import { bigint, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { artifacts } from "./artifacts";
import { users } from "./users";
import { citations } from "./citations";
import { workspaces } from "./workspaces";

/** Locator sitasi in-text (halaman/bab + affix) — CSL cite-item fields. */
export type CitationLocator = {
  locator?: string;
  label?: string;
  prefix?: string;
  suffix?: string;
};

/**
 * document_citation_usages — index/diagnostik pemakaian citation di dokumen BlockNote
 * (Citation Manager Fase 3). `blocksJson` artifact tetap menyimpan node sitasi sebagai
 * source-of-truth portable; tabel ini direkonsiliasi saat save untuk: guard hapus
 * ("dipakai N dokumen"), diagnosa missing/remap, dan hitung pemakaian per citation.
 */
export const documentCitationUsages = pgTable(
  "document_citation_usages",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    documentArtifactId: text("document_artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    citationId: text("citation_id")
      .notNull()
      .references(() => citations.id),
    inlineNodeId: text("inline_node_id"),
    occurrenceOrder: integer("occurrence_order").notNull(),
    locatorJson: jsonb("locator_json").$type<CitationLocator>(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    index("document_citation_usages_by_owner_document").on(
      t.ownerUserId,
      t.documentArtifactId,
      t.occurrenceOrder,
    ),
    index("document_citation_usages_by_owner_citation").on(t.ownerUserId, t.citationId),
  ],
);

export type DocumentCitationUsage = typeof documentCitationUsages.$inferSelect;
export type NewDocumentCitationUsage = typeof documentCitationUsages.$inferInsert;
