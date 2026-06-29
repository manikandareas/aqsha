import { ResearchService } from "@aqsha/services/research";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { chargeExternalSearch, numberPersistAndOutput } from "../lib/research";
import { callerId } from "../lib/tool-context";

/**
 * lookup_doi — metadata satu DOI via Crossref. READ, tanpa approval. Debit `external_search`
 * + persist `research_sources`.
 */
export const lookupDoi = createTool({
  id: "lookup_doi",
  description:
    "Ambil metadata sebuah makalah dari DOI-nya (Crossref): judul, penulis, tahun, venue, abstrak bila ada.",
  inputSchema: z.object({
    doi: z.string().min(1).max(200).describe("DOI (mis. 10.1000/xyz atau https://doi.org/...)."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    const allowed = await chargeExternalSearch(ctx, {
      ownerUserId,
      tool: "lookup_doi",
      provider: "crossref",
    });
    if (!allowed) {
      return { results: [], note: "Kuota pencarian eksternal sudah habis untuk periode ini." };
    }
    const candidates = await ResearchService.lookupDoi({ doi: input.doi });
    return numberPersistAndOutput(ctx, { ownerUserId, candidates, discoveryQuery: input.doi });
  },
});
