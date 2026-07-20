import { CitationRepo, type Db, WorkspaceCitationLinkRepo } from "@aqsha/db";
import { composeBibliography } from "../citations/citation-bib";
import type { CslItem } from "../citations/citation-normalize";
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
