import { ResearchService } from "@aqsha/services/research";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { runResearchTool } from "../lib/research";

/**
 * search_web — pencarian web via Firecrawl. READ, tanpa approval. Alur `runResearchTool`:
 * gate kuota → provider → debit `external_search` (2 kredit) hanya saat provider sukses (CTX-2)
 * + persist `research_sources` (panel Sources).
 *
 * CATATAN: SENGAJA tidak memakai web-search native provider model — model via gateway tak
 * menjamin web-search native tersedia, dan Firecrawl in-process sudah memenuhi kebutuhan
 * (plus kontrol kuota/billing/persist di sisi kita).
 */
export const searchWeb = createTool({
  id: "search_web",
  description:
    "Cari di web untuk bukti/informasi terkini. Kembalikan sumber dengan cuplikan + metadata; di chat bernomor [n] untuk sitasi.",
  inputSchema: z.object({
    query: z.string().min(1).max(500).describe("Kueri pencarian dalam bahasa alami."),
    limit: z.number().int().min(1).max(8).optional().describe("Jumlah hasil (default 5)."),
  }),
  execute: async (input, ctx) =>
    runResearchTool(ctx, {
      tool: "search_web",
      provider: "firecrawl_search",
      discoveryQuery: input.query,
      search: () => ResearchService.searchWeb({ query: input.query, limit: input.limit }),
    }),
});
