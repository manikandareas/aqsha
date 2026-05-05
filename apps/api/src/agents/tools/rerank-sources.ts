import { tool } from "ai";
import { z } from "zod";
import { env } from "../../config";
import { cohereRerank, isCohereConfigured } from "../external/cohere-rerank";

const candidateSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  snippet: z.string().nullable().optional(),
  provider: z
    .enum(["exa", "arxiv", "crossref", "pubmed", "direct", "memory"])
    .optional(),
});

const inputSchema = z.object({
  query: z.string().min(2),
  candidates: z.array(candidateSchema).min(2).max(50),
  topN: z.number().int().min(1).max(20).optional(),
});

export type RerankFallback = "no_cohere_key" | "rerank_error" | "below_min_candidates";

export function createRerankSourcesTool() {
  return tool({
    description:
      "Re-rank a list of candidate sources by relevance to a query using Cohere rerank. Use "
      + "after fan-out search to keep only the top-N most relevant candidates before reading. "
      + "Returns the candidates sorted by relevance descending, optionally truncated to topN.",
    inputSchema,
    execute: async ({ query, candidates, topN }, { abortSignal }) => {
      if (!isCohereConfigured()) {
        // Graceful: pass-through so SearcherAgent can still proceed.
        return {
          reranked: candidates,
          fallback: "no_cohere_key" satisfies RerankFallback,
        };
      }

      const documents = candidates.map((c) =>
        `${c.title}\n${c.snippet ?? ""}`.slice(0, 1500),
      );

      try {
        const limit = topN ?? Math.min(candidates.length, env.ASTRA_RERANK_TOP_N);
        const { ranking } = await cohereRerank({
          query,
          documents,
          topN: limit,
          signal: abortSignal,
        });

        const reranked = ranking
          .map((entry) => candidates[entry.index])
          .filter((value): value is (typeof candidates)[number] => Boolean(value));

        // If Cohere returned nothing usable, fall through to the original order.
        if (reranked.length === 0) {
          return {
            reranked: candidates.slice(0, limit),
            fallback: "rerank_error" satisfies RerankFallback,
          };
        }

        return { reranked, fallback: null };
      } catch (error) {
        const limit = topN ?? Math.min(candidates.length, env.ASTRA_RERANK_TOP_N);
        return {
          reranked: candidates.slice(0, limit),
          fallback: "rerank_error" satisfies RerankFallback,
          error: error instanceof Error ? { name: error.name, message: error.message } : null,
        };
      }
    },
  });
}
