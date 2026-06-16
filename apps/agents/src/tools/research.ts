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

/** Collapse a query to a single line WITHOUT length-clamping — the persisted
 *  `discoveryQuery` must stay the full raw string so the sub-agent panel's
 *  prefix-join against the (≤120-char clamped) tool-node query works. */
function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function numberCandidates(
  ctx: RunToolContext,
  candidates: ExternalCandidate[],
  discoveryQuery?: string,
): SourceCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    citationNumber: ctx.nextCitationNumber(),
    // searchWeb/searchArxiv tag the originating query so links re-join to a
    // step; lookupDoi has no search query (a DOI isn't a query) → left as-is.
    discoveryQuery: discoveryQuery ?? candidate.discoveryQuery,
  }));
}

/** Persist gathered sources for the run. Best-effort: a persistence failure
 *  must not break the search tool result the model is waiting on. */
async function persistSources(
  ctx: RunToolContext,
  sources: SourceCandidate[],
): Promise<void> {
  if (sources.length === 0) return;
  try {
    await ctx.store.insertSources({
      runId: ctx.runId,
      threadId: ctx.threadId,
      ownerUserId: ctx.ownerUserId,
      sources,
    });
  } catch (error) {
    console.error("Failed to persist research sources", error);
  }
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
      const numbered = numberCandidates(ctx, candidates, singleLine(args.query));
      await persistSources(ctx, numbered);
      return jsonResult(numbered);
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
      const numbered = numberCandidates(ctx, candidates, singleLine(args.query));
      await persistSources(ctx, numbered);
      return jsonResult(numbered);
    },
    readOnly,
  );

  const lookupDoi = tool(
    "lookupDoi",
    "Resolve a DOI via Crossref and return the work's metadata as a numbered source candidate.",
    { doi: z.string().min(1).max(200) },
    async (args) => {
      const candidates = await lookupDoiProvider(ctx.providers, { doi: args.doi });
      const numbered = numberCandidates(ctx, candidates);
      await persistSources(ctx, numbered);
      return jsonResult(numbered);
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
