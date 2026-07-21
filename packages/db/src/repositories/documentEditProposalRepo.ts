import { and, eq } from "drizzle-orm";
import {
  type DocumentEditProposal,
  documentEditProposals,
  type NewDocumentEditProposal,
} from "../schema/documentEditProposals";
import type { DbOrTx } from "../types";

/** Repo document_edit_proposals — pending-unik per proyek dijaga unique parsial di schema. */
export const DocumentEditProposalRepo = {
  async findById(db: DbOrTx, ownerUserId: string, id: string): Promise<DocumentEditProposal | null> {
    const rows = await db
      .select()
      .from(documentEditProposals)
      .where(
        and(eq(documentEditProposals.ownerUserId, ownerUserId), eq(documentEditProposals.id, id)),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async findPendingByWorkspace(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<DocumentEditProposal | null> {
    const rows = await db
      .select()
      .from(documentEditProposals)
      .where(
        and(
          eq(documentEditProposals.ownerUserId, ownerUserId),
          eq(documentEditProposals.workspaceId, workspaceId),
          eq(documentEditProposals.status, "pending"),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async insertPendingIfAbsent(db: DbOrTx, row: NewDocumentEditProposal): Promise<boolean> {
    const inserted = await db
      .insert(documentEditProposals)
      .values(row)
      .onConflictDoNothing()
      .returning({ id: documentEditProposals.id });
    return inserted.length === 1;
  },

  async updateById(db: DbOrTx, id: string, patch: Partial<NewDocumentEditProposal>): Promise<void> {
    await db.update(documentEditProposals).set(patch).where(eq(documentEditProposals.id, id));
  },
};
