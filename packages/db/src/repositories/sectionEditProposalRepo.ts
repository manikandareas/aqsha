import { and, eq } from "drizzle-orm";
import {
  type NewSectionEditProposal,
  type SectionEditProposal,
  sectionEditProposals,
} from "../schema/sectionEditProposals";
import type { DbOrTx } from "../types";

/** Repo section_edit_proposals — pending-unik per bab dijaga unique parsial di schema. */
export const SectionEditProposalRepo = {
  async findById(
    db: DbOrTx,
    ownerUserId: string,
    id: string,
  ): Promise<SectionEditProposal | null> {
    const rows = await db
      .select()
      .from(sectionEditProposals)
      .where(
        and(eq(sectionEditProposals.ownerUserId, ownerUserId), eq(sectionEditProposals.id, id)),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async findPendingBySection(
    db: DbOrTx,
    ownerUserId: string,
    sectionId: string,
  ): Promise<SectionEditProposal | null> {
    const rows = await db
      .select()
      .from(sectionEditProposals)
      .where(
        and(
          eq(sectionEditProposals.ownerUserId, ownerUserId),
          eq(sectionEditProposals.sectionId, sectionId),
          eq(sectionEditProposals.status, "pending"),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async insert(db: DbOrTx, row: NewSectionEditProposal): Promise<void> {
    await db.insert(sectionEditProposals).values(row);
  },

  async updateById(db: DbOrTx, id: string, patch: Partial<NewSectionEditProposal>): Promise<void> {
    await db.update(sectionEditProposals).set(patch).where(eq(sectionEditProposals.id, id));
  },

  /** Supersede pending lama sebuah bab (dipanggil sebelum insert proposal baru). */
  async supersedePendingBySection(
    db: DbOrTx,
    ownerUserId: string,
    sectionId: string,
    decidedAt: number,
  ): Promise<void> {
    await db
      .update(sectionEditProposals)
      .set({ status: "superseded", decidedAt })
      .where(
        and(
          eq(sectionEditProposals.ownerUserId, ownerUserId),
          eq(sectionEditProposals.sectionId, sectionId),
          eq(sectionEditProposals.status, "pending"),
        ),
      );
  },
};
