import { WorkspaceDocumentService } from "@aqsha/services";
import { citeIntegrity, listProjectReferences, ProjectFactsService } from "@aqsha/services/typst";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * list_project_references — READ. Isi bib proyek beserta penanda terpakai/menganggur. Ini satu-
 * satunya sumber sah untuk `@key`: key yang tak muncul di sini tidak akan ada di refs.bib saat
 * compile, sehingga sitasi yang mengutipnya menjadi yatim.
 */
export const listProjectReferencesTool = createTool({
  id: "list_project_references",
  description:
    "Daftar referensi (bib) proyek aktif: key, penulis, tahun, judul, DOI, dan apakah key itu sudah disitasi di dokumen. Pakai key dari sini saat menulis `@key`; jangan pernah mengarang key.",
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const ownerUserId = callerId(ctx);
    const db = getServiceDb();
    const workspaceId = await ProjectFactsService.workspaceIdForThread(db, {
      ownerUserId,
      threadId: threadScopeId(ctx),
    });
    if (!workspaceId) {
      return { ok: false as const, message: "Percakapan ini tidak terikat pada proyek." };
    }
    const [references, doc] = await Promise.all([
      listProjectReferences(db, { ownerUserId, workspaceId }),
      WorkspaceDocumentService.getDocument(db, { ownerUserId, workspaceId }),
    ]);
    const integrity = citeIntegrity(
      doc?.source ?? "",
      references.map((r) => r.key),
    );
    const unused = new Set(integrity.unusedReferenceKeys);
    return {
      ok: true as const,
      references: references.map((r) => ({ ...r, cited: !unused.has(r.key) })),
      orphanCiteKeys: integrity.orphanCiteKeys,
    };
  },
});
