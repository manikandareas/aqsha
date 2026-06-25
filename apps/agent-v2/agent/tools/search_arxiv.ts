import { ResearchService } from "@aqsha/services/research";
import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  callerId,
  chargeExternalSearch,
  persistResearch,
  toResearchToolOutput,
} from "../lib/tools.ts";

/**
 * search_arxiv (Slice 6.4) — pencarian preprint arXiv (Atom). READ, tanpa approval.
 * Debit `external_search` + persist `research_sources`.
 */
export default defineTool({
  description:
    "Cari preprint di arXiv. Kembalikan makalah bernomor dengan abstrak; kutip sebagai [n].",
  inputSchema: z.object({
    query: z.string().min(1).max(400).describe("Kata kunci atau id arXiv."),
    limit: z.number().int().min(1).max(8).optional().describe("Jumlah hasil (default 5)."),
  }),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    const allowed = await chargeExternalSearch(ctx, {
      ownerUserId,
      tool: "search_arxiv",
      provider: "arxiv",
      idemSuffix: input.query,
    });
    if (!allowed) {
      return { results: [], note: "Kuota pencarian eksternal sudah habis untuk periode ini." };
    }
    const candidates = await ResearchService.searchArxiv({ query: input.query, limit: input.limit });
    await persistResearch(ctx, { ownerUserId, candidates, discoveryQuery: input.query });
    return toResearchToolOutput(candidates);
  },
});
