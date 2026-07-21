import { and, asc, eq, inArray, ne } from "drizzle-orm";
import {
  type DocumentAnnotation,
  documentAnnotations,
  type NewDocumentAnnotation,
} from "../schema/documentAnnotations";
import type { DbOrTx } from "../types";

/** Repo document_annotations — query Drizzle saja; aturan lifecycle hidup di service. */
export const DocumentAnnotationRepo = {
  async findById(db: DbOrTx, ownerUserId: string, id: string): Promise<DocumentAnnotation | null> {
    const rows = await db
      .select()
      .from(documentAnnotations)
      .where(and(eq(documentAnnotations.ownerUserId, ownerUserId), eq(documentAnnotations.id, id)))
      .limit(1);
    return rows[0] ?? null;
  },

  async listByWorkspace(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<DocumentAnnotation[]> {
    return db
      .select()
      .from(documentAnnotations)
      .where(
        and(
          eq(documentAnnotations.ownerUserId, ownerUserId),
          eq(documentAnnotations.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(documentAnnotations.createdAt));
  },

  async insert(db: DbOrTx, row: NewDocumentAnnotation): Promise<void> {
    await db.insert(documentAnnotations).values(row);
  },

  async updateById(db: DbOrTx, id: string, patch: Partial<NewDocumentAnnotation>): Promise<void> {
    await db.update(documentAnnotations).set(patch).where(eq(documentAnnotations.id, id));
  },

  async deleteById(db: DbOrTx, id: string): Promise<void> {
    await db.delete(documentAnnotations).where(eq(documentAnnotations.id, id));
  },

  /** Transisi status massal reguler dibatasi owner, workspace, dan daftar id. */
  async updateStatusByIds(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
    ids: string[],
    patch: Partial<NewDocumentAnnotation>,
  ): Promise<void> {
    if (ids.length === 0) return;
    await db
      .update(documentAnnotations)
      .set(patch)
      .where(
        and(
          eq(documentAnnotations.ownerUserId, ownerUserId),
          eq(documentAnnotations.workspaceId, workspaceId),
          inArray(documentAnnotations.id, ids),
        ),
      );
  },

  /** Proposal boleh mengubah lifecycle anotasi, kecuali clear eksplisit oleh user. */
  async updateProposalStatusByIds(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
    ids: string[],
    patch: Partial<NewDocumentAnnotation>,
  ): Promise<void> {
    if (ids.length === 0) return;
    await db
      .update(documentAnnotations)
      .set(patch)
      .where(
        and(
          eq(documentAnnotations.ownerUserId, ownerUserId),
          eq(documentAnnotations.workspaceId, workspaceId),
          inArray(documentAnnotations.id, ids),
          ne(documentAnnotations.status, "dismissed"),
        ),
      );
  },
};
