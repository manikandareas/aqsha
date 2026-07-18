import { and, eq, getTableColumns, sql } from "drizzle-orm";
import {
  type DocumentCitationUsage,
  documentCitationUsages,
  type NewDocumentCitationUsage,
} from "../schema/documentCitationUsages";
import { workspaceSections } from "../schema/workspaceSections";
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

  /**
   * Semua usage lintas bab satu proyek — dasar agregasi daftar pustaka proyek.
   *
   * Inner join ke `workspace_sections` (bukan filter langsung ke `workspace_id`
   * yang didenormalisasi di baris usage) karena bibliografi proyek hanya boleh
   * mencerminkan bab yang masih ada. Menghapus section tidak menghapus artifact
   * atau usage terkait — tidak ada cascade dari `workspace_sections` ke tabel ini —
   * jadi baris usage bab yang sudah dihapus akan tetap "hidup" dan bocor sebagai
   * sitasi hantu kalau query hanya menyaring `workspace_id`.
   */
  async listByWorkspace(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
  ): Promise<DocumentCitationUsage[]> {
    return db
      .select(getTableColumns(documentCitationUsages))
      .from(documentCitationUsages)
      .innerJoin(
        workspaceSections,
        eq(workspaceSections.documentArtifactId, documentCitationUsages.documentArtifactId),
      )
      .where(
        and(
          eq(documentCitationUsages.ownerUserId, ownerUserId),
          eq(workspaceSections.workspaceId, workspaceId),
        ),
      );
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
