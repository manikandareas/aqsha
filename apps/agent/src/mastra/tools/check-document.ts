import { DocumentReportService, ProjectFactsService } from "@aqsha/services/typst";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * check_document — READ yang menjalankan dry-run compile, jadi lebih mahal dari tool peta.
 * Pakai saat user menanyakan kesiapan dokumen atau sebelum menutup pekerjaan besar, bukan rutin
 * di tiap giliran.
 */
export const checkDocument = createTool({
  id: "check_document",
  description:
    "Periksa kesiapan dokumen Typst proyek: apakah compile bersih, sitasi yang tak punya entri referensi, referensi yang tak pernah disitasi, bab kosong, dan judul bab kembar. Memakai compile — panggil seperlunya, bukan tiap giliran.",
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
    const report = await DocumentReportService.check(db, { ownerUserId, workspaceId });
    return { ok: true as const, report };
  },
});
