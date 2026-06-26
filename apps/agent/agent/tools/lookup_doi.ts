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
 * lookup_doi (Slice 6.4) — metadata satu DOI via Crossref. READ, tanpa approval.
 * Debit `external_search` + persist `research_sources`.
 */
export default defineTool({
  description:
    "Ambil metadata sebuah makalah dari DOI-nya (Crossref): judul, penulis, tahun, venue, abstrak bila ada.",
  inputSchema: z.object({
    doi: z.string().min(1).max(200).describe("DOI (mis. 10.1000/xyz atau https://doi.org/...)."),
  }),
  async execute(input, ctx) {
    const ownerUserId = callerId(ctx);
    const allowed = await chargeExternalSearch(ctx, {
      ownerUserId,
      tool: "lookup_doi",
      provider: "crossref",
      idemSuffix: input.doi,
    });
    if (!allowed) {
      return { results: [], note: "Kuota pencarian eksternal sudah habis untuk periode ini." };
    }
    const candidates = await ResearchService.lookupDoi({ doi: input.doi });
    await persistResearch(ctx, { ownerUserId, candidates, discoveryQuery: input.doi });
    return toResearchToolOutput(candidates);
  },
});
