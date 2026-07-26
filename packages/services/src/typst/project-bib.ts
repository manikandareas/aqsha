import { CitationRepo, type Db, WorkspaceCitationLinkRepo } from "@aqsha/db";
import { composeBibliography } from "../citations/citation-bib";
import {
  type CslItem,
  cslItemToColumns,
  formatAuthorDisplay,
} from "../citations/citation-normalize";
import { CitationService } from "../citations/citation.service";

/**
 * .bib proyek = seluruh sitasi ter-link workspace, kunci persisten. Diserahkan ke `refs.bib`
 * saat compile/ekspor; Typst `#bibliography` hanya merender key yang benar-benar disitasi.
 * Kosong bila proyek belum punya sitasi (compile tetap menulis refs.bib kosong agar file ada).
 */
export async function composeProjectBib(
  db: Db,
  input: { ownerUserId: string; workspaceId: string },
): Promise<string> {
  const links = await WorkspaceCitationLinkRepo.listByWorkspace(db, input.workspaceId);
  const ids = [...new Set(links.map((l) => l.citationId))];
  if (ids.length === 0) return "";
  const keyById = await CitationService.ensureBibKeys(db, {
    ownerUserId: input.ownerUserId,
    citationIds: ids,
  });
  const rows = (await CitationRepo.findByIds(db, input.ownerUserId, ids)).filter((r) => !r.deletedAt);
  return composeBibliography(rows.map((r) => ({ key: keyById[r.id]!, csl: r.cslJson as CslItem })));
}

export type ProjectReference = {
  citationId: string;
  key: string;
  authors: string;
  year: string;
  title: string;
  doi: string | null;
};

/**
 * Referensi proyek dalam bentuk terstruktur (bukan teks .bib) — dipakai manifest, pemeriksa
 * dokumen, dan tool daftar referensi supaya key yang dipakai agent selalu key yang sama dengan
 * yang tertulis di refs.bib saat compile.
 */
export async function listProjectReferences(
  db: Db,
  input: { ownerUserId: string; workspaceId: string },
): Promise<ProjectReference[]> {
  const links = await WorkspaceCitationLinkRepo.listByWorkspace(db, input.workspaceId);
  const ids = [...new Set(links.map((l) => l.citationId))];
  if (ids.length === 0) return [];
  const keyById = await CitationService.ensureBibKeys(db, {
    ownerUserId: input.ownerUserId,
    citationIds: ids,
  });
  const rows = (await CitationRepo.findByIds(db, input.ownerUserId, ids)).filter((r) => !r.deletedAt);
  return rows.map((row) => {
    // Normalisasi CSL yang sama dengan read-model sitasi, supaya penulis/tahun/DOI yang dilihat
    // agent identik dengan yang dilihat user di daftar referensi.
    const columns = cslItemToColumns(row.cslJson as CslItem);
    return {
      citationId: row.id,
      key: keyById[row.id]!,
      authors: columns.authors.map(formatAuthorDisplay).filter(Boolean).join(", "),
      year: columns.publishedYear === null ? "" : String(columns.publishedYear),
      title: columns.title,
      doi: columns.doi,
    };
  });
}
