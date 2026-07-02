import { ResearchService } from "@aqsha/services/research";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { runResearchTool } from "../lib/research";

/**
 * search_arxiv — pencarian preprint arXiv (Atom). READ, tanpa approval. Alur `runResearchTool`:
 * gate kuota → provider → debit `external_search` hanya saat provider sukses (CTX-2) + persist
 * `research_sources`.
 */
export const searchArxiv = createTool({
  id: "search_arxiv",
  description:
    "Cari preprint di arXiv. Kembalikan makalah dengan abstrak + authors/tahun; di chat bernomor [n] untuk sitasi.",
  inputSchema: z.object({
    query: z.string().min(1).max(400).describe("Kata kunci atau id arXiv."),
    limit: z.number().int().min(1).max(8).optional().describe("Jumlah hasil (default 5)."),
  }),
  execute: async (input, ctx) =>
    runResearchTool(ctx, {
      tool: "search_arxiv",
      provider: "arxiv",
      discoveryQuery: input.query,
      search: () => ResearchService.searchArxiv({ query: input.query, limit: input.limit }),
    }),
});
