import { ResearchService } from "@aqsha/services/research";
import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  callerId,
  chargeExternalSearch,
  persistResearch,
  toResearchToolOutput,
} from "../lib/tools";

/**
 * search_papers (Slice 6.4) — pencarian karya akademik lintas-penerbit via OpenAlex
 * (pelengkap arXiv untuk literatur ter-peer-review). READ, tanpa approval. Debit
 * `external_search` + persist `research_sources`.
 */
export default defineTool({
  description:
    "Cari makalah akademik (OpenAlex; mencakup jurnal ter-peer-review, bukan hanya preprint). Kembalikan makalah bernomor; kutip sebagai [n].",
  inputSchema: z.object({
    query: z.string().min(1).max(400).describe("Topik atau judul makalah."),
    limit: z.number().int().min(1).max(10).optional().describe("Jumlah hasil (default 5)."),
  }),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    const allowed = await chargeExternalSearch(ctx, {
      ownerUserId,
      tool: "search_papers",
      provider: "openalex",
      idemSuffix: input.query,
    });
    if (!allowed) {
      return { results: [], note: "Kuota pencarian eksternal sudah habis untuk periode ini." };
    }
    const candidates = await ResearchService.searchOpenAlex({
      query: input.query,
      limit: input.limit,
    });
    await persistResearch(ctx, { ownerUserId, candidates, discoveryQuery: input.query });
    return toResearchToolOutput(candidates);
  },
});
