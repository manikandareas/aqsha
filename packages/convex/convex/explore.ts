import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalMutation, query, type ActionCtx } from "./_generated/server";
import { requireCurrentUser } from "./auth";
import { throwAppError } from "./lib/appError";
import { explorePaperValidator } from "./explore/validators";
import {
  lookupDoiProvider,
  providerFailureReason,
  searchArxivProvider,
  searchExaCandidates,
  searchJinaCandidates,
  searchOpenAlexWorks,
  type ExternalCandidate,
} from "./agent/providers/externalProviders";
import {
  candidatesToExplorePapers,
  exploreCacheKey,
  normalizeExploreQuery,
  type ExploreMode,
  type ExplorePaper,
  type ExploreProvider,
  type ExploreProviderStatus,
  type ExploreSearchResponse,
} from "./explore/model";

const defaultRecommendationQuery = "education research learning assessment artificial intelligence";
const minFallbackResults = 5;

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
    fromYear: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ExploreSearchResponse> => {
    const user = await requireCurrentUser(ctx);
    const query = normalizeExploreQuery(args.query);
    const mode: ExploreMode = args.mode ?? (query ? "search" : "recommendations");
    const limit = clampLimit(args.limit);
    const fromYear = clampFromYear(args.fromYear);
    const cacheKey = exploreCacheKey({ mode, query, limit, fromYear });
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
          fromYear,
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

// Detail resolver that survives a cold deep-link: read the cache, and if the
// paper was never persisted by a prior Explore/Feed visit, fetch it on-miss
// from providers (DOI lookup / OpenAlex / arXiv) keyed off the canonical key.
// A query cannot do network I/O, so this is an action.
export const getOrFetchPaper = action({
  args: {
    key: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<(ExplorePaper & { lastSeenAt: number }) | null> => {
    const user = await requireCurrentUser(ctx);
    const cached = await ctx.runQuery(api.explore.getPaper, { key: args.key });
    if (cached) {
      return cached;
    }

    const probe = deriveKeyProbe(args.key);
    if (!probe) {
      return null;
    }

    const candidates: ExternalCandidate[] = [];

    if (probe.doi) {
      try {
        candidates.push(
          ...(await lookupDoiProvider(ctx, {
            ownerUserId: user._id,
            doi: probe.doi,
          })),
        );
      } catch {
        // Best-effort: fall through to keyword search.
      }
    }

    if (candidateCount(candidates) === 0) {
      try {
        candidates.push(
          ...(await searchOpenAlexWorks(ctx, {
            ownerUserId: user._id,
            query: probe.query,
            limit: 8,
            mode: "search",
          })),
        );
      } catch {
        // Best-effort.
      }
    }

    if (probe.arxivId && candidateCount(candidates) === 0) {
      try {
        candidates.push(
          ...(await searchArxivProvider(ctx, {
            ownerUserId: user._id,
            query: probe.query,
            limit: 8,
          })),
        );
      } catch {
        // Best-effort.
      }
    }

    const papers = candidatesToExplorePapers(candidates, 24);
    if (papers.length === 0) {
      return null;
    }
    await cacheExplorePapers(ctx, papers);

    const match = papers.find((paper) => paper.key === args.key);
    if (match) {
      return { ...match, lastSeenAt: Date.now() };
    }
    // The canonical key may now resolve from the freshly-cached batch.
    return await ctx.runQuery(api.explore.getPaper, { key: args.key });
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
    internal.agent.providers.externalProviders.getCache,
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
  await ctx.runMutation(internal.agent.providers.externalProviders.putCache, {
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
    throwAppError({
      message: "Limit must be a number",
      code: "explore_limit_invalid",
      field: "limit",
      severity: "warning",
    });
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

function clampFromYear(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  const year = Math.floor(value);
  if (year < 1900 || year > 2100) {
    return undefined;
  }
  return year;
}

// Turn a canonical source key (doi:/arxiv:/url:/title:) back into a provider
// probe so a cold deep-link can be re-resolved on miss.
function deriveKeyProbe(
  key: string,
): { query: string; doi?: string; arxivId?: string } | null {
  const separator = key.indexOf(":");
  if (separator === -1) {
    return key.trim() ? { query: key.trim() } : null;
  }
  const scheme = key.slice(0, separator);
  const value = key.slice(separator + 1).trim();
  if (!value) {
    return null;
  }
  if (scheme === "doi") {
    return { query: value, doi: value };
  }
  if (scheme === "arxiv") {
    return { query: value, arxivId: value };
  }
  return { query: value };
}
