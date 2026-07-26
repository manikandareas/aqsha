import { WorkspaceDocumentService } from "@aqsha/services";
import {
  findOutlineSectionByTitle,
  ProjectFactsService,
  sliceOutlineSection,
} from "@aqsha/services/typst";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * read_document_section — READ terarah. Mengembalikan SATU bagian dokumen apa adanya sehingga
 * kutipan `oldText` proposal berasal dari teks nyata, bukan ingatan model. `contentVersion` yang
 * ikut dikembalikan adalah basis yang sama dengan yang divalidasi saat proposal dibuat.
 */
export const readDocumentSection = createTool({
  id: "read_document_section",
  description:
    "Baca satu bab/subbab dokumen Typst proyek beserta rentang barisnya. Pakai `headingIndex` dari get_document_outline atau `title` judulnya. Kutipan `edits.oldText` untuk propose_document_edit WAJIB berasal dari teks yang dikembalikan tool ini.",
  inputSchema: z.object({
    headingIndex: z.number().int().min(0).optional().describe("Indeks heading dari peta dokumen."),
    title: z.string().min(1).optional().describe("Judul bab bila indeksnya tak diketahui."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const db = getServiceDb();
    const workspaceId = await ProjectFactsService.workspaceIdForThread(db, {
      ownerUserId,
      threadId: threadScopeId(ctx),
    });
    if (!workspaceId) {
      return { ok: false as const, message: "Percakapan ini tidak terikat pada proyek." };
    }
    const doc = await WorkspaceDocumentService.getDocument(db, { ownerUserId, workspaceId });
    const source = doc?.source ?? "";
    const section =
      typeof input.headingIndex === "number"
        ? sliceOutlineSection(source, input.headingIndex)
        : input.title
          ? findOutlineSectionByTitle(source, input.title)
          : null;
    if (!section) {
      return {
        ok: false as const,
        message: "Bagian tidak ditemukan. Panggil get_document_outline untuk melihat bab yang ada.",
      };
    }
    return { ok: true as const, contentVersion: doc?.contentVersion ?? 0, section };
  },
});
