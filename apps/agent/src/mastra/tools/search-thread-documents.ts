import { ChatThreadRepo } from "@aqsha/db";
import { RagService } from "@aqsha/services/rag";
import { WorkspaceService } from "@aqsha/services/workspace";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * search_thread_documents — RAG read atas dokumen pengguna: lampiran percakapan dan
 * paper perpustakaan yang tertaut ke proyek aktif (PDF/teks ter-index, pgvector).
 * READ, tanpa approval, TANPA debit `external_search` (lokal;
 * biaya embedding terhitung di `normal_chat`). Degrade graceful bila embedding disabled.
 */
export const searchThreadDocuments = createTool({
  id: "search_thread_documents",
  description:
    "Cari di dokumen milik pengguna — lampiran percakapan dan paper perpustakaan yang tertaut ke proyek aktif. Pakai SEBELUM pencarian web bila pertanyaan menyinggung dokumen terlampir. Hasil dapat menyertakan `bibKey` yang siap dipakai sebagai `@key`; bila `bibKey` tidak ada, ambil key dari list_project_references dan jangan pernah mengarangnya.",
  inputSchema: z.object({
    query: z.string().min(1).max(500).describe("Apa yang dicari di dalam dokumen."),
    limit: z.number().int().min(1).max(20).optional().describe("Jumlah cuplikan (default 6)."),
    workspaceId: z
      .string()
      .optional()
      .describe(
        "Batasi pencarian ke satu workspace yang disematkan pengguna (workspaceId dari catatan konteks). Kosongkan untuk mencari dokumen proyek aktif.",
      ),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const db = getServiceDb();
    const thread = await ChatThreadRepo.findById(db, threadScopeId(ctx));
    if (!thread || thread.ownerUserId !== ownerUserId) {
      return { matches: [], note: "Thread aktif tidak ditemukan." };
    }
    const targetWorkspaceId = input.workspaceId
      ? (await WorkspaceService.assertWorkspaceOwner(db, ownerUserId, input.workspaceId)).id
      : thread.workspaceId;
    const matches = await RagService.searchThreadDocuments(getServiceDb(), {
      ownerUserId,
      workspaceId: targetWorkspaceId,
      query: input.query,
      limit: input.limit,
    });
    return {
      matches: matches.map((m) => ({
        artifactId: m.artifactId,
        title: m.title,
        score: Number(m.score.toFixed(3)),
        content: m.content,
        // Identitas sitasi hanya muncul untuk item perpustakaan. `bibKey` boleh absen
        // saat belum ter-assign — jangan pernah mengarangnya.
        ...(m.citationId ? { citationId: m.citationId } : {}),
        ...(m.bibKey ? { bibKey: m.bibKey } : {}),
      })),
      // Fallback (B4): kosong ≠ tidak ada dokumen. Arahkan model membaca langsung alih-alih
      // menyimpulkan dokumennya tak ada / meminta unggah ulang.
      ...(matches.length === 0
        ? {
            note: "Tidak ada cuplikan yang cocok secara makna. Ini BUKAN berarti dokumennya tidak ada. Jika dokumen relevan tercantum di manifest lampiran, baca isinya langsung via get_render_payload (pakai artifactId), atau panggil list_artifacts untuk melihat lampiran yang tersedia.",
          }
        : {}),
    };
  },
});
