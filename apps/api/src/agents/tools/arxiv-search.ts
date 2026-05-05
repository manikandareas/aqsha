import { tool } from "ai";
import { z } from "zod";
import { searchArxiv } from "../external/arxiv";
import type { CandidateSource } from "../external/types";

const inputSchema = z.object({
  query: z.string().min(2).max(300),
  maxResults: z.number().int().min(1).max(15).default(10),
  sortBy: z.enum(["relevance", "lastUpdatedDate", "submittedDate"]).default("relevance"),
});

export function createArxivSearchTool() {
  return tool({
    description:
      "Search arXiv for academic preprints. Best for primary research in physics, math, CS, "
      + "quantitative biology, statistics. Returns up to 15 candidates with title, abstract "
      + "(snippet), authors, publishedDate, DOI when available.",
    inputSchema,
    execute: async ({ query, maxResults, sortBy }, { abortSignal }) => {
      try {
        const candidates = await searchArxiv(query, {
          maxResults,
          sortBy,
          signal: abortSignal,
        });
        return { provider: "arxiv" as const, candidates: stripRaw(candidates) };
      } catch (error) {
        return failureResult("arxiv", error);
      }
    },
  });
}

// ───────────────────────── shared helpers (also used by crossref/pubmed tools) ─────────────────────────

export type ToolFailure = {
  provider: "arxiv" | "crossref" | "pubmed";
  candidates: never[];
  error: { name: string; message: string };
};

export function stripRaw(candidates: CandidateSource[]): Array<Omit<CandidateSource, "raw">> {
  return candidates.map(({ raw: _raw, ...rest }) => rest);
}

export function failureResult(
  provider: ToolFailure["provider"],
  error: unknown,
): ToolFailure {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    provider,
    candidates: [] as never[],
    error: { name: err.name, message: err.message },
  };
}
