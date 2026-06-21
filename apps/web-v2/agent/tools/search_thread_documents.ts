import { RagService } from "@aqsha/services/rag";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerId, getServiceDb } from "../lib/tools";

/**
 * search_thread_documents (Slice 6.4) — RAG read atas dokumen yang terlampir pada
 * percakapan ini (PDF/teks ter-index, pgvector). READ, tanpa approval, TANPA debit
 * `external_search` (lokal; biaya embedding terhitung di `normal_chat`). Degrade
 * graceful bila embedding disabled → kembalikan daftar kosong.
 */
export default defineTool({
  description:
    "Cari di dokumen yang dilampirkan pengguna pada percakapan ini untuk menjawab dari sumber mereka sendiri. Pakai SEBELUM pencarian web bila pertanyaan menyinggung dokumen terlampir.",
  inputSchema: z.object({
    query: z.string().min(1).max(500).describe("Apa yang dicari di dalam dokumen."),
    limit: z.number().int().min(1).max(20).optional().describe("Jumlah cuplikan (default 6)."),
  }),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    const matches = await RagService.searchThreadDocuments(getServiceDb(), {
      ownerUserId,
      threadId: ctx.session.id,
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
    };
  },
});
