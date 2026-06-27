import { ResearchService } from "@aqsha/services/research";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { chargeExternalSearch, persistResearch, toResearchToolOutput } from "../lib/research";
import { callerId } from "../lib/tool-context";

/**
 * search_web — pencarian web via Firecrawl. READ, tanpa approval. Debit `external_search`
 * (2 kredit) + persist `research_sources` (panel Sources).
 *
 * CATATAN: built-in `web_search` provider eve (native) SENGAJA tak diport — model via gateway
 * tak menjamin web-search native, dan ini (Firecrawl in-process) sudah memenuhi. Filesystem
 * builtins/sandbox eve juga tak diport (Mastra tanpa sandbox).
 */
export const searchWeb = createTool({
  id: "search_web",
  description:
    "Cari di web untuk bukti/informasi terkini. Kembalikan sumber bernomor dengan cuplikan; kutip sebagai [n].",
  inputSchema: z.object({
    query: z.string().min(1).max(500).describe("Kueri pencarian dalam bahasa alami."),
    limit: z.number().int().min(1).max(8).optional().describe("Jumlah hasil (default 5)."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const allowed = await chargeExternalSearch(ctx, {
      ownerUserId,
      tool: "search_web",
      provider: "firecrawl_search",
    });
    if (!allowed) {
      return { results: [], note: "Kuota pencarian eksternal sudah habis untuk periode ini." };
    }
    const candidates = await ResearchService.searchWeb({ query: input.query, limit: input.limit });
    await persistResearch(ctx, { ownerUserId, candidates, discoveryQuery: input.query });
    return toResearchToolOutput(candidates);
  },
});
