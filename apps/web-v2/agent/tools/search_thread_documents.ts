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
    workspaceId: z
      .string()
      .optional()
      .describe(
        "Batasi pencarian ke satu workspace yang disematkan pengguna (workspaceId dari catatan konteks). Kosongkan untuk mencari dokumen yang dilampirkan ke percakapan.",
      ),
  }),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    // Bila user menyematkan workspace (@mention), model mengoper workspaceId-nya →
    // RAG di-scope ke workspace itu; jika tidak, default ke dokumen thread ini.
    // ponytail: scoping bergantung model mengoper id dari catatan clientContext;
    // upgrade ke default per-turn bila eve mengekspos clientContext ke ToolContext.
    const matches = await RagService.searchThreadDocuments(getServiceDb(), {
      ownerUserId,
      ...(input.workspaceId
        ? { workspaceId: input.workspaceId }
        : { threadId: ctx.session.id }),
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
