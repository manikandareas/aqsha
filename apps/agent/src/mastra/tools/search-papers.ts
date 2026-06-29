import { ResearchService } from "@aqsha/services/research";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { chargeExternalSearch, numberPersistAndOutput } from "../lib/research";
import { callerId } from "../lib/tool-context";

/**
 * search_papers — pencarian karya akademik lintas-penerbit via OpenAlex. READ, tanpa approval.
 * Debit `external_search` + persist `research_sources`.
 */
export const searchPapers = createTool({
  id: "search_papers",
  description:
    "Cari makalah akademik (OpenAlex; mencakup jurnal ter-peer-review, bukan hanya preprint). Kembalikan makalah bernomor; kutip sebagai [n].",
  inputSchema: z.object({
    query: z.string().min(1).max(400).describe("Topik atau judul makalah."),
    limit: z.number().int().min(1).max(10).optional().describe("Jumlah hasil (default 5)."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const allowed = await chargeExternalSearch(ctx, {
      ownerUserId,
      tool: "search_papers",
      provider: "openalex",
    });
    if (!allowed) {
      return { results: [], note: "Kuota pencarian eksternal sudah habis untuk periode ini." };
    }
    const candidates = await ResearchService.searchOpenAlex({
      query: input.query,
      limit: input.limit,
    });
    return numberPersistAndOutput(ctx, { ownerUserId, candidates, discoveryQuery: input.query });
  },
});
