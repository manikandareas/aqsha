import { ResearchService } from "@aqsha/services/research";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { runResearchTool } from "../lib/research";

/**
 * lookup_doi — metadata satu DOI via Crossref. READ, tanpa approval. Alur `runResearchTool`:
 * gate kuota → provider → debit `external_search` hanya saat provider sukses (CTX-2) + persist
 * `research_sources`.
 */
export const lookupDoi = createTool({
  id: "lookup_doi",
  description:
    "Ambil metadata sebuah makalah dari DOI-nya (Crossref): judul, penulis, tahun, venue, abstrak bila ada.",
  inputSchema: z.object({
    doi: z.string().min(1).max(200).describe("DOI (mis. 10.1000/xyz atau https://doi.org/...)."),
  }),
  execute: async (input, ctx) =>
    runResearchTool(ctx, {
      tool: "lookup_doi",
      provider: "crossref",
      discoveryQuery: input.doi,
      search: () => ResearchService.lookupDoi({ doi: input.doi }),
    }),
});
