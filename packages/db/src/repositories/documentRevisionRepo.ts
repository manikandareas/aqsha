import { and, desc, eq, lt } from "drizzle-orm";
import {
  type DocumentRevision,
  documentRevisions,
  type NewDocumentRevision,
} from "../schema/documentRevisions";
import type { DbOrTx } from "../types";

/** Repo document_revisions — query Drizzle saja; retensi dihitung service. */
export const DocumentRevisionRepo = {
  async insert(db: DbOrTx, row: NewDocumentRevision): Promise<void> {
    await db.insert(documentRevisions).values(row);
  },

  async listByArtifact(
    db: DbOrTx,
    ownerUserId: string,
    artifactId: string,
    limit = 20,
  ): Promise<DocumentRevision[]> {
    return db
      .select()
      .from(documentRevisions)
      .where(
        and(
          eq(documentRevisions.ownerUserId, ownerUserId),
          eq(documentRevisions.artifactId, artifactId),
        ),
      )
      .orderBy(desc(documentRevisions.version))
      .limit(limit);
  },

  async findByVersion(
    db: DbOrTx,
    ownerUserId: string,
    artifactId: string,
    version: number,
  ): Promise<DocumentRevision | null> {
    const rows = await db
      .select()
      .from(documentRevisions)
      .where(
        and(
          eq(documentRevisions.ownerUserId, ownerUserId),
          eq(documentRevisions.artifactId, artifactId),
          eq(documentRevisions.version, version),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  /** Retensi: hapus revisi ber-version < minVersionKept (dipanggil dalam tx save). */
  async deleteOlderThan(db: DbOrTx, artifactId: string, minVersionKept: number): Promise<void> {
    await db
      .delete(documentRevisions)
      .where(
        and(
          eq(documentRevisions.artifactId, artifactId),
          lt(documentRevisions.version, minVersionKept),
        ),
      );
  },
};
