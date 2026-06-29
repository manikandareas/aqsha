import { RagService } from "@aqsha/services/rag";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getServiceDb } from "../lib/db";
import { callerId, threadScopeId } from "../lib/tool-context";

/**
 * search_thread_documents — RAG read atas dokumen yang terlampir pada percakapan ini
 * (PDF/teks ter-index, pgvector). READ, tanpa approval, TANPA debit `external_search` (lokal;
 * biaya embedding terhitung di `normal_chat`). Degrade graceful bila embedding disabled.
 */
export const searchThreadDocuments = createTool({
  id: "search_thread_documents",
  description:
    "Cari di dokumen yang dilampirkan pengguna pada percakapan ini untuk menjawab dari sumber mereka sendiri. Pakai SEBELUM pencarian web bila pertanyaan menyinggung dokumen terlampir.",
  inputSchema: z.object({
    query: z.string().min(1).max(500).describe("Apa yang dicari di dalam dokumen."),
    limit: z.number().int().min(1).max(20).optional().describe("Jumlah cuplikan (default 6)."),
    workspaceId: z
      .string()
      .optional()
      .describe(
        "Batasi pencarian ke satu workspace yang disematkan pengguna (workspaceId dari catatan konteks). Kosongkan untuk mencari dokumen yang dilampirkan ke percakapan.",
      ),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const matches = await RagService.searchThreadDocuments(getServiceDb(), {
      ownerUserId,
      ...(input.workspaceId
        ? { workspaceId: input.workspaceId }
        : { threadId: threadScopeId(ctx) }),
      query: input.query,
      limit: input.limit,
    });
    return {
      matches: matches.map((m) => ({
        artifactId: m.artifactId,
        title: m.title,
        score: Number(m.score.toFixed(3)),
        content: m.content,
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
