import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { workspaces } from "./workspaces";
import { workspaceSections } from "./workspaceSections";

export const PROPOSAL_STATUSES = ["pending", "accepted", "rejected", "superseded"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/**
 * section_edit_proposals — usulan suntingan Astra atas sumber LaTeX bab, HANYA yang sudah lolos
 * dry-run compile (usulan gagal compile tak pernah menyentuh tabel ini). `base_version` =
 * contentVersion saat agen membaca; accept memakai CAS `saveDocument` sehingga tak pernah
 * menimpa tulisan yang lebih baru. Maksimal satu `pending` per bab (unique parsial) —
 * proposal baru men-supersede pending lama.
 */
export const sectionEditProposals = pgTable(
  "section_edit_proposals",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sectionId: text("section_id")
      .notNull()
      .references(() => workspaceSections.id, { onDelete: "cascade" }),
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
      "section_edit_proposals_status_check",
      sql`${t.status} in ('pending', 'accepted', 'rejected', 'superseded')`,
    ),
    uniqueIndex("section_edit_proposals_pending_by_section")
      .on(t.sectionId)
      .where(sql`${t.status} = 'pending'`),
    index("section_edit_proposals_by_owner_section").on(t.ownerUserId, t.sectionId),
  ],
);

export type SectionEditProposal = typeof sectionEditProposals.$inferSelect;
export type NewSectionEditProposal = typeof sectionEditProposals.$inferInsert;
