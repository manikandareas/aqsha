import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, query, type ActionCtx } from "./_generated/server";
import { requireCurrentUser } from "./auth";
import {
  lookupDoiProvider,
  providerFailureReason,
  searchArxivProvider,
  searchExaCandidates,
  searchJinaCandidates,
  searchOpenAlexWorks,
  type ExternalCandidate,
} from "./agent/externalProviders";
import {
  candidatesToExplorePapers,
  exploreCacheKey,
  normalizeExploreQuery,
  type ExploreMode,
  type ExplorePaper,
  type ExploreProvider,
  type ExploreProviderStatus,
  type ExploreSearchResponse,
} from "./exploreModel";

const defaultRecommendationQuery = "education research learning assessment artificial intelligence";
const minFallbackResults = 5;

const exploreProviderValidator = v.union(
  v.literal("OpenAlex"),
  v.literal("arXiv"),
  v.literal("Exa"),
  v.literal("Jina"),
  v.literal("Crossref"),
);

const explorePaperValidator = v.object({
  key: v.string(),
  title: v.string(),
  snippet: v.string(),
  abstract: v.optional(v.string()),
  url: v.string(),
  pdfUrl: v.optional(v.string()),
  doi: v.optional(v.string()),
  arxivId: v.optional(v.string()),
  openalexId: v.optional(v.string()),
  provider: exploreProviderValidator,
  sourceLabel: v.string(),
  authors: v.array(v.string()),
  year: v.optional(v.number()),
  publicationDate: v.optional(v.string()),
  venue: v.optional(v.string()),
  citedByCount: v.optional(v.number()),
  isOpenAccess: v.optional(v.boolean()),
  topics: v.array(v.string()),
  score: v.optional(v.number()),
});

type ProviderResult = {
  items: ExternalCandidate[];
  status: ExploreProviderStatus["status"];
  message?: string;
};

export const searchPapers = action({
  args: {
    query: v.optional(v.string()),
    limit: v.optional(v.number()),
    mode: v.optional(v.union(v.literal("recommendations"), v.literal("search"))),
  },
  handler: async (ctx, args): Promise<ExploreSearchResponse> => {
    const user = await requireCurrentUser(ctx);
    const query = normalizeExploreQuery(args.query);
    const mode: ExploreMode = args.mode ?? (query ? "search" : "recommendations");
    const limit = clampLimit(args.limit);
    const cacheKey = exploreCacheKey({ mode, query, limit });
    const cached = await readExploreCache(ctx, cacheKey);
    if (cached) {
      await cacheExplorePapers(ctx, cached.items);
      return { ...cached, cached: true };
    }

    const providerStatus: ExploreProviderStatus[] = [];
    const candidates: ExternalCandidate[] = [];
    const providerQuery = query || defaultRecommendationQuery;

    await collectProvider(providerStatus, candidates, "OpenAlex", {
      run: () =>
        searchOpenAlexWorks(ctx, {
          ownerUserId: user._id,
          query,
          limit,
          mode,
        }),
    });

    if (candidateCount(candidates) < minFallbackResults) {
      await collectProvider(providerStatus, candidates, "arXiv", {
        run: () =>
          searchArxivProvider(ctx, {
            ownerUserId: user._id,
            query: providerQuery,
            limit,
          }),
      });
    } else {
      providerStatus.push({ provider: "arXiv", status: "skipped" });
    }

    if (candidateCount(candidates) < minFallbackResults) {
      await collectProvider(providerStatus, candidates, "Exa", {
        run: () =>
          searchExaCandidates(ctx, {
            ownerUserId: user._id,
            query: providerQuery,
            limit,
            category: "research paper",
          }),
      });
    } else {
      providerStatus.push({ provider: "Exa", status: "skipped" });
    }

    if (candidateCount(candidates) < minFallbackResults) {
      await collectProvider(providerStatus, candidates, "Jina", {
        run: () =>
          searchJinaCandidates(ctx, {
            ownerUserId: user._id,
            query: `${providerQuery} research paper`,
            limit,
          }),
      });
    } else {
      providerStatus.push({ provider: "Jina", status: "skipped" });
    }

    const doi = extractDoiQuery(query);
    if (doi && candidateCount(candidates) < limit) {
      await collectProvider(providerStatus, candidates, "Crossref", {
        run: () =>
          lookupDoiProvider(ctx, {
            ownerUserId: user._id,
            doi,
          }),
      });
    } else {
      providerStatus.push({ provider: "Crossref", status: "skipped" });
    }

    const response: ExploreSearchResponse = {
      items: candidatesToExplorePapers(candidates, limit),
      mode,
      query,
      providerStatus,
      generatedAt: Date.now(),
      cached: false,
    };
    await writeExploreCache(ctx, cacheKey, response);
    await cacheExplorePapers(ctx, response.items);
    return response;
  },
});

export const getPaper = query({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args): Promise<(ExplorePaper & { lastSeenAt: number }) | null> => {
    await requireCurrentUser(ctx);
    const paper = await ctx.db
      .query("explorePapers")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (!paper) {
      return null;
    }

    const { _id, _creationTime, ...detail } = paper;
    void _id;
    void _creationTime;
    return detail;
  },
});

export const upsertPaperCache = internalMutation({
  args: {
    papers: v.array(explorePaperValidator),
    lastSeenAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const paper of args.papers) {
      const existing = await ctx.db
        .query("explorePapers")
        .withIndex("by_key", (q) => q.eq("key", paper.key))
        .unique();

      const nextPaper = {
        ...paper,
        lastSeenAt: args.lastSeenAt,
      };

      if (existing) {
        await ctx.db.replace("explorePapers", existing._id, nextPaper);
      } else {
        await ctx.db.insert("explorePapers", nextPaper);
      }
    }
    return null;
  },
});

async function collectProvider(
  providerStatus: ExploreProviderStatus[],
  candidates: ExternalCandidate[],
  provider: ExploreProvider,
  args: {
    run: () => Promise<ExternalCandidate[]>;
  },
) {
  const result = await runProvider(args.run);
  candidates.push(...result.items);
  providerStatus.push({
    provider,
    status: result.status,
    message: result.message,
  });
}

async function runProvider(
  run: () => Promise<ExternalCandidate[]>,
): Promise<ProviderResult> {
  try {
    const results = await run();
    const items: ExternalCandidate[] = [];
    const failures: string[] = [];
    for (const candidate of results) {
      const failureReason = providerFailureReason(candidate);
      if (failureReason) {
        failures.push(failureReason);
      } else {
        items.push(candidate);
      }
    }
    if (items.length > 0) {
      return { items, status: "ready" };
    }
    return {
      items,
      status: failures.length > 0 ? "error" : "fallback",
      message: failures[0] ?? "No results returned.",
    };
  } catch (error) {
    return {
      items: [],
      status: "error",
      message: error instanceof Error ? error.message : "Provider failed.",
    };
  }
}

async function readExploreCache(ctx: ActionCtx, cacheKey: string) {
  const cached: { valueJson: string } | null = await ctx.runQuery(
    internal.agent.externalProviders.getCache,
    { provider: "explore", cacheKey },
  );
  if (!cached) {
    return null;
  }
  try {
    return JSON.parse(cached.valueJson) as ExploreSearchResponse;
  } catch {
    return null;
  }
}

async function writeExploreCache(
  ctx: ActionCtx,
  cacheKey: string,
  response: ExploreSearchResponse,
) {
  await ctx.runMutation(internal.agent.externalProviders.putCache, {
    provider: "explore",
    cacheKey,
    status: response.items.length > 0 ? "ready" : "empty",
    valueJson: JSON.stringify(response),
  });
}

async function cacheExplorePapers(ctx: ActionCtx, papers: ExplorePaper[]) {
  if (papers.length === 0) {
    return;
  }
  await ctx.runMutation(internal.explore.upsertPaperCache, {
    papers,
    lastSeenAt: Date.now(),
  });
}

function clampLimit(limit: number | undefined) {
  if (limit === undefined) {
    return 12;
  }
  if (!Number.isFinite(limit)) {
    throw new ConvexError("Limit must be a number");
  }
  return Math.min(Math.max(Math.floor(limit), 1), 24);
}

function candidateCount(candidates: ExternalCandidate[]) {
  return candidates.length;
}

function extractDoiQuery(query: string) {
  const match = query.match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/i);
  return match?.[0]?.toLowerCase();
}
