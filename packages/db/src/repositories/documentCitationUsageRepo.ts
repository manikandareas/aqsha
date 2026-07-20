import { and, eq, sql } from "drizzle-orm";
import {
  type DocumentCitationUsage,
  documentCitationUsages,
  type NewDocumentCitationUsage,
} from "../schema/documentCitationUsages";
import type { DbOrTx } from "../types";

/** Repo document_citation_usages — query Drizzle saja; rekonsiliasi di @aqsha/services. */
export const DocumentCitationUsageRepo = {
  async listByDocument(
    db: DbOrTx,
    ownerUserId: string,
    documentArtifactId: string,
  ): Promise<DocumentCitationUsage[]> {
    return db
      .select()
      .from(documentCitationUsages)
      .where(
        and(
          eq(documentCitationUsages.ownerUserId, ownerUserId),
          eq(documentCitationUsages.documentArtifactId, documentArtifactId),
        ),
      )
      .orderBy(documentCitationUsages.occurrenceOrder);
  },

  /** Semua usage satu proyek (satu dokumen kontinu) — dasar agregasi daftar pustaka proyek. */
  async listByWorkspace(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<DocumentCitationUsage[]> {
    return db
      .select()
      .from(documentCitationUsages)
      .where(
        and(
          eq(documentCitationUsages.ownerUserId, ownerUserId),
          eq(documentCitationUsages.workspaceId, workspaceId),
        ),
      )
      .orderBy(documentCitationUsages.occurrenceOrder);
  },

  /** Ganti seluruh usage satu dokumen (delete-all + insert) — dipanggil dalam tx save. */
  async replaceForDocument(
    db: DbOrTx,
    args: {
      ownerUserId: string;
      documentArtifactId: string;
      rows: NewDocumentCitationUsage[];
    },
  ): Promise<void> {
    await db
      .delete(documentCitationUsages)
      .where(
        and(
          eq(documentCitationUsages.ownerUserId, args.ownerUserId),
          eq(documentCitationUsages.documentArtifactId, args.documentArtifactId),
        ),
      );
    if (args.rows.length > 0) {
      await db.insert(documentCitationUsages).values(args.rows);
    }
  },

  /** Jumlah dokumen distinct yang memakai satu citation (guard hapus + indikator detail). */
  async countDocumentsUsingCitation(
    db: DbOrTx,
    ownerUserId: string,
    citationId: string,
  ): Promise<number> {
    const rows = await db
      .select({
        count: sql<number>`count(distinct ${documentCitationUsages.documentArtifactId})::int`,
      })
      .from(documentCitationUsages)
      .where(
        and(
          eq(documentCitationUsages.ownerUserId, ownerUserId),
          eq(documentCitationUsages.citationId, citationId),
        ),
      );
    return rows[0]?.count ?? 0;
  },
};
