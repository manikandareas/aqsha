import { createTool } from "@convex-dev/agent";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import {
  lookupDoiProvider,
  searchArxivProvider,
  searchWebProvider,
} from "./externalProviders";
import { corpusRag, userNamespace } from "./rag";
import type { SourceCandidate } from "./sourceCandidates";
import { trimForSnippet } from "./sourceCandidates";

type AqshaToolCtx = ActionCtx & {
  userId?: string;
  threadId?: string;
  messageId?: string;
};

const querySchema = z.object({
  query: z.string().min(1).max(500).describe("Search query"),
  limit: z.number().int().min(1).max(5).optional().describe("Maximum results"),
});

export const researchTools: ToolSet = {
  searchCorpus: createTool<typeof querySchema._output, SourceCandidate[], AqshaToolCtx>({
    description:
      "Search the user's private research corpus. Use this before external search when answering research questions.",
    inputSchema: querySchema,
    execute: async (ctx, input): Promise<SourceCandidate[]> => {
      const ownerUserId = requireToolUser(ctx);
      const results = await corpusRag.search(ctx, {
        namespace: userNamespace(ownerUserId),
        query: input.query,
        limit: input.limit ?? 5,
        vectorScoreThreshold: 0.35,
      });
      return numberCandidates(
        results.entries.slice(0, 5).map((entry) => ({
          origin: "corpus" as const,
          evidenceStrength: "strong" as const,
          title: entry.metadata?.title ?? entry.title ?? "Corpus source",
          locator: entry.metadata?.locator ?? entry.entryId,
          url: entry.metadata?.url,
          doi: entry.metadata?.doi,
          arxivId: entry.metadata?.arxivId,
          snippet: trimForSnippet(entry.text || results.text || "Corpus match"),
          corpusSourceId: entry.metadata?.corpusSourceId as
            | Id<"corpusSources">
            | undefined,
        })),
        1,
      );
    },
  }),
  searchWeb: createTool<typeof querySchema._output, SourceCandidate[], AqshaToolCtx>({
    description:
      "Search the public web through Exa for current or broad context when corpus and academic sources are not enough.",
    inputSchema: querySchema,
    execute: async (ctx, input): Promise<SourceCandidate[]> => {
      const results = await searchWebProvider(ctx, {
        ownerUserId: requireToolUser(ctx),
        query: input.query,
        limit: input.limit,
      });
      return numberCandidates(results, 61);
    },
  }),
  searchArxiv: createTool<typeof querySchema._output, SourceCandidate[], AqshaToolCtx>({
    description:
      "Search arXiv for academic preprints, especially computer science, math, physics, statistics, and quantitative research.",
    inputSchema: querySchema,
    execute: async (ctx, input): Promise<SourceCandidate[]> => {
      const results = await searchArxivProvider(ctx, {
        ownerUserId: requireToolUser(ctx),
        query: input.query,
        limit: input.limit,
      });
      return numberCandidates(results, 21);
    },
  }),
  lookupDoi: createTool<
    { doi: string },
    SourceCandidate[],
    AqshaToolCtx
  >({
    description:
      "Look up Crossref metadata for a DOI. Use when the user provides a DOI or a cited paper needs DOI metadata.",
    inputSchema: z.object({
      doi: z.string().min(1).max(200).describe("DOI or doi.org URL"),
    }),
    execute: async (ctx, input): Promise<SourceCandidate[]> => {
      const results = await lookupDoiProvider(ctx, {
        ownerUserId: requireToolUser(ctx),
        doi: input.doi,
      });
      return numberCandidates(results, 41);
    },
  }),
};

function numberCandidates(
  candidates: Array<Omit<SourceCandidate, "citationNumber">>,
  start: number,
): SourceCandidate[] {
  return candidates.slice(0, 5).map((candidate, index) => ({
    ...candidate,
    citationNumber: start + index,
  }));
}

function requireToolUser(ctx: AqshaToolCtx) {
  if (!ctx.userId) {
    throw new Error("Tool call is missing user context");
  }
  return ctx.userId;
}
