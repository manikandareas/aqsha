import { createTool } from "@convex-dev/agent";
import type { ToolSet } from "ai";
import { z } from "zod";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  lookupDoiProvider,
  jinaSearchWeb,
  searchWebProvider,
  searchArxivProvider,
} from "./externalProviders";
import type { SourceCandidate } from "./sourceCandidates";
import { type AgentToolCtx, requireToolUser, requireToolThread } from "./toolContext";

type AqshaToolCtx = AgentToolCtx & {
  runId?: Id<"agentRuns">;
  citationCounter?: { next: () => number };
};

const querySchema = z.object({
  query: z.string().min(1).max(500).describe("Search query"),
  limit: z.number().int().min(1).max(5).optional().describe("Maximum results"),
});

const threadDocumentSearchSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(500)
    .describe("Question or search phrase to look up in documents uploaded or selected in this chat thread."),
});

export const researchTools: ToolSet = {
  searchWeb: createTool<typeof querySchema._output, SourceCandidate[], AqshaToolCtx>({
    description:
      "Search the public web through Exa with Jina Search fallback for current or broad context when corpus and academic sources are not enough.",
    inputSchema: querySchema,
    execute: async (ctx, input): Promise<SourceCandidate[]> => {
      const ownerUserId = requireToolUser(ctx);
      const counter = requireCitationCounter(ctx);
      const exaResults = await searchWebProvider(ctx, {
        ownerUserId,
        query: input.query,
        limit: input.limit,
      });
      if (hasUsableResults(exaResults)) {
        return numberCandidates(exaResults, counter);
      }
      const jinaResults = await jinaSearchWeb(ctx, {
        ownerUserId,
        query: input.query,
        limit: input.limit,
      });
      return numberCandidates(jinaResults, counter);
    },
  }),
  searchArxiv: createTool<typeof querySchema._output, SourceCandidate[], AqshaToolCtx>({
    description:
      "Search arXiv for academic preprints, especially computer science, math, physics, statistics, and quantitative research.",
    inputSchema: querySchema,
    execute: async (ctx, input): Promise<SourceCandidate[]> => {
      const counter = requireCitationCounter(ctx);
      const results = await searchArxivProvider(ctx, {
        ownerUserId: requireToolUser(ctx),
        query: input.query,
        limit: input.limit,
      });
      return numberCandidates(results, counter);
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
      const counter = requireCitationCounter(ctx);
      const results = await lookupDoiProvider(ctx, {
        ownerUserId: requireToolUser(ctx),
        doi: input.doi,
      });
      return numberCandidates(results, counter);
    },
  }),
};

export const normalChatTools: ToolSet = {
  searchThreadDocuments: createTool<
    typeof threadDocumentSearchSchema._output,
    string,
    AqshaToolCtx
  >({
    description:
      "Search documents that the user uploaded or selected in this chat thread. Use this before answering follow-up questions that refer to a previous file, document, paper, journal, artifact, or 'that/this document'.",
    inputSchema: threadDocumentSearchSchema,
    execute: async (ctx, input): Promise<string> => {
      const ownerUserId = requireToolUser(ctx);
      const threadId = requireToolThread(ctx);
      const context = await ctx.runAction(internal.agent.ragContext.searchThreadDocuments, {
        ownerUserId,
        threadId,
        query: input.query,
      });
      return context || "No relevant uploaded or selected thread document context was found.";
    },
  }),
  searchWeb: researchTools.searchWeb,
  searchArxiv: researchTools.searchArxiv,
  lookupDoi: researchTools.lookupDoi,
};

function numberCandidates(
  candidates: Array<Omit<SourceCandidate, "citationNumber">>,
  counter: { next: () => number },
): SourceCandidate[] {
  return candidates.slice(0, 5).map((candidate) => ({
    ...candidate,
    citationNumber: counter.next(),
  }));
}

function hasUsableResults(candidates: Array<Omit<SourceCandidate, "citationNumber">>) {
  return candidates.some(
    (candidate) =>
      candidate.evidenceStrength !== "weak" &&
      candidate.title.trim().length > 0 &&
      candidate.snippet.trim().length > 0,
  );
}

function requireCitationCounter(ctx: AqshaToolCtx) {
  if (!ctx.citationCounter) {
    return createCitationCounter(1);
  }
  return ctx.citationCounter;
}

export function createCitationCounter(start = 1) {
  let current = start;
  return { next: () => current++ };
}
