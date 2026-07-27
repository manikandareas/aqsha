import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const PROPOSAL_STATUSES = ["pending", "accepted", "rejected", "superseded"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/**
 * document_edit_proposals — usulan suntingan Astra atas sumber Typst dokumen proyek,
 * HANYA yang sudah lolos dry-run compile (usulan gagal compile tak pernah menyentuh tabel
 * ini). `base_source`/`base_version` = snapshot dokumen saat agen membaca, dan indeks hunk
 * SELALU dihitung terhadap snapshot itu — tanpanya, menerima satu hunk akan menaikkan versi
 * dokumen dan membuat sisa proposal langsung dinilai basi. `applied_version` mengikuti versi
 * terakhir yang ditulis proposal ini, sehingga kebasian diukur terhadap tulisannya sendiri,
 * bukan terhadap versi awal. Tulisan memakai CAS `saveDocument` sehingga tak pernah menimpa
 * tulisan yang lebih baru. Maksimal satu `pending` per proyek (unique parsial) agar review
 * aktif tidak dapat tertimpa proposal baru.
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
    /** Snapshot sumber saat proposal dibuat; indeks hunk selalu dihitung terhadap ini. */
    baseSource: text("base_source").notNull().default(""),
    /** Peta indeks hunk → "accepted" | "rejected"; hunk yang belum diputuskan tak muncul di sini. */
    hunkDecisions: jsonb("hunk_decisions")
      .$type<Record<string, "accepted" | "rejected">>()
      .notNull()
      .default({}),
    /** Versi dokumen terakhir yang ditulis proposal ini; kebasian diukur terhadap nilai ini. */
    appliedVersion: integer("applied_version"),
    summary: text("summary").notNull(),
    resubmitInstruction: text("resubmit_instruction").notNull().default(""),
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
