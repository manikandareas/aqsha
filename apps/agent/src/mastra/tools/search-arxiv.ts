import { ResearchService } from "@aqsha/services/research";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { chargeExternalSearch, persistResearch, toResearchToolOutput } from "../lib/research";
import { callerId } from "../lib/tool-context";

/**
 * search_arxiv — pencarian preprint arXiv (Atom). READ, tanpa approval. Debit
 * `external_search` + persist `research_sources`.
 */
export const searchArxiv = createTool({
  id: "search_arxiv",
  description:
    "Cari preprint di arXiv. Kembalikan makalah bernomor dengan abstrak; kutip sebagai [n].",
  inputSchema: z.object({
    query: z.string().min(1).max(400).describe("Kata kunci atau id arXiv."),
    limit: z.number().int().min(1).max(8).optional().describe("Jumlah hasil (default 5)."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const allowed = await chargeExternalSearch(ctx, {
      ownerUserId,
      tool: "search_arxiv",
      provider: "arxiv",
    });
    if (!allowed) {
      return { results: [], note: "Kuota pencarian eksternal sudah habis untuk periode ini." };
    }
    const candidates = await ResearchService.searchArxiv({ query: input.query, limit: input.limit });
    await persistResearch(ctx, { ownerUserId, candidates, discoveryQuery: input.query });
    return toResearchToolOutput(candidates);
  },
});
