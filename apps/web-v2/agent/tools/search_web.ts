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
 * search_web (Slice 6.4) — pencarian web Jina-only (D-G). READ, tanpa approval.
 * Debit `external_search` (2 kredit) + persist `research_sources` (panel Sources).
 */
export default defineTool({
  description:
    "Cari di web untuk bukti/informasi terkini (Jina). Kembalikan sumber bernomor dengan cuplikan; kutip sebagai [n].",
  inputSchema: z.object({
    query: z.string().min(1).max(500).describe("Kueri pencarian dalam bahasa alami."),
    limit: z.number().int().min(1).max(8).optional().describe("Jumlah hasil (default 5)."),
  }),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    const allowed = await chargeExternalSearch(ctx, {
      ownerUserId,
      tool: "search_web",
      provider: "jina_search",
      idemSuffix: input.query,
    });
    if (!allowed) {
      return { results: [], note: "Kuota pencarian eksternal sudah habis untuk periode ini." };
    }
    const candidates = await ResearchService.searchWeb({ query: input.query, limit: input.limit });
    await persistResearch(ctx, { ownerUserId, candidates, discoveryQuery: input.query });
    return toResearchToolOutput(candidates);
  },
});
