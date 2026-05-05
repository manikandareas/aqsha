import { tool } from "ai";
import { z } from "zod";
import type { MemoryService } from "../../modules/memory/service";

type MemoryRecallDeps = {
  memoryService: MemoryService;
  ownerUserId: string;
};

export function createMemoryRecallTool(deps: MemoryRecallDeps) {
  return tool({
    description:
      "Recall previously cached evidence cards similar to this sub-question. " +
      "Call this BEFORE web_search_exa when memory is available. Returns up to 8 candidates " +
      "(provider='memory') and their backing evidence excerpts.",
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe("Sub-question text to search memory with."),
      questionContext: z.string().nullable(),
    }),
    execute: async ({ query }) => {
      const matches = await deps.memoryService.recallByQuery(query, {
        ownerUserId: deps.ownerUserId,
      });

      return {
        provider: "memory" as const,
        candidates: matches.map((match) => ({
          title: match.sourceTitle ?? match.sourceUrl,
          url: match.sourceUrl,
          snippet: match.claimText,
          publishedDate: match.firstSeenAt,
          sourceClass: "unknown" as const,
          relevanceScore: match.similarity,
          provider: "memory" as const,
        })),
        evidence: matches,
      };
    },
  });
}
