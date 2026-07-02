import { ResearchService } from "@aqsha/services/research";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { runResearchTool } from "../lib/research";

/**
 * search_papers — pencarian karya akademik lintas-penerbit via OpenAlex. READ, tanpa approval.
 * Alur `runResearchTool`: gate kuota → provider → debit `external_search` hanya saat provider
 * sukses (CTX-2) + persist `research_sources`.
 */
export const searchPapers = createTool({
  id: "search_papers",
  description:
    "Pintu UTAMA pencarian literatur akademik (OpenAlex, lintas-disiplin: kesehatan, pendidikan, sosial-humaniora, sains, teknik; jurnal ter-peer-review + preprint). Kembalikan makalah + authors/tahun/venue; di chat bernomor [n] untuk sitasi. JANGAN dipakai untuk berita/informasi web umum (pakai search_web).",
  inputSchema: z.object({
    query: z.string().min(1).max(400).describe("Topik atau judul makalah."),
    limit: z.number().int().min(1).max(10).optional().describe("Jumlah hasil (default 5)."),
  }),
  execute: async (input, ctx) =>
    runResearchTool(ctx, {
      tool: "search_papers",
      provider: "openalex",
      discoveryQuery: input.query,
      search: () => ResearchService.searchOpenAlex({ query: input.query, limit: input.limit }),
    }),
});
