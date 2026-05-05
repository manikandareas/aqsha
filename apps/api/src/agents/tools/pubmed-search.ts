import { tool } from "ai";
import { z } from "zod";
import { searchPubmed } from "../external/pubmed";
import { failureResult, stripRaw } from "./arxiv-search";

const inputSchema = z.object({
  query: z.string().min(2).max(300),
  retmax: z.number().int().min(1).max(20).default(10),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  untilDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pubType: z
    .enum([
      "Clinical Trial",
      "Randomized Controlled Trial",
      "Meta-Analysis",
      "Systematic Review",
      "Review",
      "Case Reports",
      "Observational Study",
    ])
    .optional()
    .describe("PubMed publication type filter."),
});

export function createPubmedSearchTool() {
  return tool({
    description:
      "Search PubMed (NCBI E-utilities) for biomedical, clinical, public health, and "
      + "pharmacology literature. Returns up to 20 candidates with title, authors, journal, "
      + "publication date, and DOI when available. Prefer this over web search for "
      + "evidence-based medicine queries (RCTs, systematic reviews, meta-analyses).",
    inputSchema,
    execute: async ({ query, retmax, fromDate, untilDate, pubType }, { abortSignal }) => {
      try {
        const candidates = await searchPubmed(query, {
          retmax,
          fromDate,
          untilDate,
          pubType,
          signal: abortSignal,
        });
        return { provider: "pubmed" as const, candidates: stripRaw(candidates) };
      } catch (error) {
        return failureResult("pubmed", error);
      }
    },
  });
}
