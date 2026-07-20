import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const PROPOSAL_STATUSES = ["pending", "accepted", "rejected", "superseded"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/**
 * document_edit_proposals — usulan suntingan Astra atas sumber Typst dokumen proyek,
 * HANYA yang sudah lolos dry-run compile (usulan gagal compile tak pernah menyentuh tabel
 * ini). `base_version` = contentVersion saat agen membaca; accept memakai CAS `saveDocument`
 * sehingga tak pernah menimpa tulisan yang lebih baru. Maksimal satu `pending` per proyek
 * (unique parsial) — proposal baru men-supersede pending lama.
 */
export const documentEditProposals = pgTable(
  "document_edit_proposals",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    threadId: text("thread_id"),
    baseVersion: integer("base_version").notNull(),
    proposedSource: text("proposed_source").notNull(),
    summary: text("summary").notNull(),
    annotationIds: jsonb("annotation_ids").$type<string[]>().notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    decidedAt: bigint("decided_at", { mode: "number" }),
  },
  (t) => [
    check(
      "document_edit_proposals_status_check",
      sql`${t.status} in ('pending', 'accepted', 'rejected', 'superseded')`,
    ),
    uniqueIndex("document_edit_proposals_pending_by_workspace")
      .on(t.workspaceId)
      .where(sql`${t.status} = 'pending'`),
    index("document_edit_proposals_by_owner_workspace").on(t.ownerUserId, t.workspaceId),
  ],
);

export type DocumentEditProposal = typeof documentEditProposals.$inferSelect;
export type NewDocumentEditProposal = typeof documentEditProposals.$inferInsert;
