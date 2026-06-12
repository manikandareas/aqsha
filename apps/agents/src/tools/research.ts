import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { SourceCandidate } from "@aqsha/agent-contracts";
import {
  lookupDoiProvider,
  searchArxivProvider,
  searchWebProvider,
} from "../providers";
import type { ExternalCandidate } from "../providers/types";
import { jsonResult, textResult, type RunToolContext } from "./context";

// Research tools (port of agent/research/researchTools.ts). Read-only
// annotations let the SDK parallelize them. The shared per-turn citation
// counter keeps [n] markers stable across tools.

function numberCandidates(
  ctx: RunToolContext,
  candidates: ExternalCandidate[],
): SourceCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    citationNumber: ctx.nextCitationNumber(),
  }));
}

const readOnly = { annotations: { readOnlyHint: true } };

export function buildResearchTools(ctx: RunToolContext) {
  const searchWeb = tool(
    "searchWeb",
    "Search the web for evidence (Exa with Jina fallback). Returns numbered source candidates with snippets; cite them as [n].",
    {
      query: z.string().min(1).max(500),
      limit: z.number().int().min(1).max(5).optional(),
    },
    async (args) => {
      const candidates = await searchWebProvider(ctx.providers, {
        query: args.query,
        limit: args.limit,
      });
      return jsonResult(numberCandidates(ctx, candidates));
    },
    readOnly,
  );

  const searchArxiv = tool(
    "searchArxiv",
    "Search arXiv for preprints by topic or arXiv id. Returns numbered source candidates; cite them as [n].",
    {
      query: z.string().min(1).max(500),
      limit: z.number().int().min(1).max(5).optional(),
    },
    async (args) => {
      const candidates = await searchArxivProvider(ctx.providers, {
        query: args.query,
        limit: args.limit,
      });
      return jsonResult(numberCandidates(ctx, candidates));
    },
    readOnly,
  );

  const lookupDoi = tool(
    "lookupDoi",
    "Resolve a DOI via Crossref and return the work's metadata as a numbered source candidate.",
    { doi: z.string().min(1).max(200) },
    async (args) => {
      const candidates = await lookupDoiProvider(ctx.providers, { doi: args.doi });
      return jsonResult(numberCandidates(ctx, candidates));
    },
    readOnly,
  );

  const searchThreadDocuments = tool(
    "searchThreadDocuments",
    "Search the documents uploaded or selected in this thread (RAG) and return the most relevant excerpts.",
    { query: z.string().min(1).max(500) },
    async (args) => {
      const excerpt = await ctx.store.searchThreadDocuments(
        ctx.threadId,
        args.query,
      );
      return textResult(excerpt);
    },
    readOnly,
  );

  return [searchWeb, searchArxiv, lookupDoi, searchThreadDocuments];
}
