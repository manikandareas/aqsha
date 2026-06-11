import { XMLParser } from "fast-xml-parser";
import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import {
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "../../_generated/server";
import { getExaClient } from "./exaClient";
import { rateLimiter } from "../../limits";
import { asArray } from "../../lib/arrays";
import { normalizeDoi } from "../../lib/identifiers";
import { collapse, normalizeKey } from "../../lib/text";
import { providerValidator, type Provider } from "./providerCache";
import type { SourceCandidate, SourceOrigin } from "../research/sourceCandidates";
import { trimForSnippet } from "../research/sourceCandidates";
import { researchUserAgent } from "./userAgent";
export { searchOpenAlexWorks } from "./openalexProvider";

// Cache lifetime by result status. Successful lookups are stable for a day; a nil
// result is retried sooner (corpora like arXiv publish daily); transient provider
// failures clear quickly so we don't pin an error for long.
const CACHE_TTL_BY_STATUS = {
  ready: 1000 * 60 * 60 * 24, // 24h
  empty: 1000 * 60 * 90, // 1.5h
  failed: 1000 * 60 * 12, // 12m
} as const;
const CROSSREF_ENDPOINT = "https://api.crossref.org/works";
const ARXIV_ENDPOINT = "https://export.arxiv.org/api/query";
const JINA_SEARCH_ENDPOINT = "https://s.jina.ai";
const JINA_READER_ENDPOINT = "https://r.jina.ai";
const JINA_RERANK_ENDPOINT = "https://api.jina.ai/v1/rerank";
const JINA_RERANK_MODEL = "jina-reranker-v2-base-multilingual";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

export type ExternalCandidate = Omit<SourceCandidate, "citationNumber">;

export type JinaReadResult = {
  ok: boolean;
  title: string;
  url: string;
  markdown: string;
  snippet: string;
  failureReason?: string;
};

export type RerankInput = {
  sourceKey: string;
  title: string;
  text: string;
};

export type RerankResult = {
  sourceKey: string;
  score: number;
  rank: number;
};

export type SearchCandidateOptions = {
  ownerUserId: string;
  query: string;
  limit?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  category?: "company" | "news" | "pdf" | "research paper" | "personal site";
  siteDomains?: string[];
  country?: string;
  language?: string;
  searchType?: "web" | "news";
};

export const getCache = internalQuery({
  args: {
    provider: providerValidator,
    cacheKey: v.string(),
  },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("externalLookupCache")
      .withIndex("by_provider_key", (q) =>
        q.eq("provider", args.provider).eq("cacheKey", args.cacheKey),
      )
      .unique();

    if (!cached || cached.expiresAt < Date.now()) {
      return null;
    }
    return cached;
  },
});

export const putCache = internalMutation({
  args: {
    provider: providerValidator,
    cacheKey: v.string(),
    status: v.union(v.literal("ready"), v.literal("empty"), v.literal("failed")),
    valueJson: v.string(),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("externalLookupCache")
      .withIndex("by_provider_key", (q) =>
        q.eq("provider", args.provider).eq("cacheKey", args.cacheKey),
      )
      .unique();
    const patch = {
      status: args.status,
      valueJson: args.valueJson,
      failureReason: args.failureReason,
      updatedAt: now,
      expiresAt: now + CACHE_TTL_BY_STATUS[args.status],
    };
    if (existing) {
      await ctx.db.patch("externalLookupCache", existing._id, patch);
      return;
    }
    await ctx.db.insert("externalLookupCache", {
      provider: args.provider,
      cacheKey: args.cacheKey,
      createdAt: now,
      ...patch,
    });
  },
});

export async function searchWebProvider(
  ctx: ActionCtx,
  args: { ownerUserId: string; query: string; limit?: number },
): Promise<ExternalCandidate[]> {
  return searchExaCandidates(ctx, args);
}

export async function searchExaCandidates(
  ctx: ActionCtx,
  args: SearchCandidateOptions,
): Promise<ExternalCandidate[]> {
  const query = args.query.trim();
  if (!query) {
    return [];
  }

  const exa = getExaClient();
  if (!exa) {
    return [];
  }

  const limit = Math.min(args.limit ?? 8, 20);
  const cacheKey = normalizeKey(JSON.stringify({
    query,
    limit,
    includeDomains: args.includeDomains,
    excludeDomains: args.excludeDomains,
    startPublishedDate: args.startPublishedDate,
    endPublishedDate: args.endPublishedDate,
    category: args.category,
  }));
  const cached: ExternalCandidate[] | null = await readCachedCandidates(ctx, "exa", cacheKey);
  if (cached) {
    return cached;
  }
  // Cache miss → charge the cost gate before the network call (AUD-04).
  await limitExternal(ctx, args.ownerUserId, "exa");

  try {
    const response = await exa.search(query, {
      numResults: limit,
      type: "auto",
      includeDomains: cleanDomains(args.includeDomains),
      excludeDomains: cleanDomains(args.excludeDomains),
      startPublishedDate: args.startPublishedDate,
      endPublishedDate: args.endPublishedDate,
      category: args.category,
      contents: { text: { maxCharacters: 4_000 }, highlights: { maxCharacters: 600 }, summary: true },
    });
    const candidates = response.results.map((result) =>
      candidate({
        origin: "web",
        provider: "exa",
        evidenceStrength: "medium",
        title: result.title || result.url,
        locator: result.url,
        url: result.url,
        snippet:
          trimForSnippet(result.summary) ||
          trimForSnippet(result.text) ||
          trimForSnippet(result.highlights?.join(" ")) ||
          "No extract was available from this web result.",
        metadataJson: JSON.stringify({ provider: "exa", publishedDate: result.publishedDate }),
      }),
    );
    await writeCachedCandidates(ctx, "exa", cacheKey, candidates);
    return candidates;
  } catch (error) {
    const failure = providerFailure("web", readableError(error));
    await writeCachedCandidates(ctx, "exa", cacheKey, failure, readableError(error));
    return failure;
  }
}

export async function jinaSearchWeb(
  ctx: ActionCtx,
  args: { ownerUserId: string; query: string; limit?: number },
): Promise<ExternalCandidate[]> {
  return searchJinaCandidates(ctx, args);
}

export async function searchJinaCandidates(
  ctx: ActionCtx,
  args: SearchCandidateOptions,
): Promise<ExternalCandidate[]> {
  const query = buildJinaQuery(args);
  if (!query) {
    return [];
  }

  const limit = Math.min(args.limit ?? 8, 20);
  const cacheKey = normalizeKey(JSON.stringify({
    query,
    limit,
    country: args.country,
    language: args.language,
    searchType: args.searchType,
  }));
  const cached: ExternalCandidate[] | null = await readCachedCandidates(ctx, "jina_search", cacheKey);
  if (cached) {
    return cached;
  }
  // Cache miss → charge the cost gate before the network call (AUD-04).
  await limitExternal(ctx, args.ownerUserId, "jina_search");

  try {
    const url = new URL(`${JINA_SEARCH_ENDPOINT}/${encodeURIComponent(query)}`);
    url.searchParams.set("num", String(limit));
    if (args.country) {
      url.searchParams.set("gl", args.country);
    }
    if (args.language) {
      url.searchParams.set("hl", args.language);
    }
    if (args.searchType === "news") {
      url.searchParams.set("type", "news");
    }
    const response = await fetch(url, {
      headers: jinaHeaders({
        Accept: "application/json",
        "X-Return-Format": "markdown",
        "X-Retain-Links": "all",
        "X-Max-Tokens": "12000",
      }),
    });
    if (!response.ok) {
      throw new Error(`Jina Search returned ${response.status}`);
    }
    const text = await response.text();
    const parsed = parseJinaSearchResponse(text, limit);
    await writeCachedCandidates(ctx, "jina_search", cacheKey, parsed);
    return parsed;
  } catch (error) {
    const failure = providerFailure("web", readableError(error), "jina_search");
    await writeCachedCandidates(ctx, "jina_search", cacheKey, failure, readableError(error));
    return failure;
  }
}

export async function jinaReadUrl(
  ctx: ActionCtx,
  args: { ownerUserId: string; url: string },
): Promise<JinaReadResult> {
  return readWithJinaReader(ctx, args);
}

export async function readWithJinaReader(
  ctx: ActionCtx,
  args: { ownerUserId: string; url: string },
): Promise<JinaReadResult> {
  const url = args.url.trim();
  if (!url) {
    return readFailure(url, "URL is empty");
  }

  const cacheKey = normalizeKey(url);
  const cached: JinaReadResult | null = await readCachedJson(ctx, "jina_read", cacheKey);
  if (cached) {
    return cached;
  }
  // Cache miss → charge the cost gate before the network call (AUD-04).
  await limitExternal(ctx, args.ownerUserId, "jina_read");

  try {
    const response = await fetch(`${JINA_READER_ENDPOINT}/${url}`, {
      headers: jinaHeaders({
        Accept: "application/json",
        "X-Return-Format": "markdown",
        "X-Retain-Links": "all",
        "X-With-Links-Summary": "true",
        "X-Max-Tokens": "18000",
        "X-Timeout": "20",
      }),
    });
    if (!response.ok) {
      throw new Error(`Jina Reader returned ${response.status}`);
    }
    const text = await response.text();
    const result = parseJinaReaderResponse(text, url);
    await writeCachedJson(ctx, "jina_read", cacheKey, result);
    return result;
  } catch (error) {
    const result = readFailure(url, readableError(error));
    await writeCachedJson(ctx, "jina_read", cacheKey, result, readableError(error));
    return result;
  }
}

export async function jinaRerank(
  ctx: ActionCtx,
  args: { ownerUserId: string; query: string; documents: RerankInput[]; topN?: number },
): Promise<RerankResult[]> {
  const documents = args.documents.filter((document) => document.text.trim());
  if (documents.length === 0) {
    return [];
  }

  const topN = Math.min(args.topN ?? documents.length, documents.length);
  const cacheKey = normalizeKey(
    JSON.stringify({
      query: args.query,
      topN,
      documents: documents.map((document) => [document.sourceKey, document.text.slice(0, 300)]),
    }),
  );
  const cached: RerankResult[] | null = await readCachedJson(ctx, "jina_rerank", cacheKey);
  if (cached) {
    return cached;
  }
  // Cache miss → charge the cost gate before the network call (AUD-04).
  await limitExternal(ctx, args.ownerUserId, "jina_rerank");

  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    return fallbackRerank(args.query, documents, topN);
  }

  try {
    const response = await fetch(JINA_RERANK_ENDPOINT, {
      method: "POST",
      headers: jinaHeaders({
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }),
      body: JSON.stringify({
        model: JINA_RERANK_MODEL,
        query: args.query,
        top_n: topN,
        documents: documents.map((document) => `${document.title}\n${document.text}`),
      }),
    });
    if (!response.ok) {
      throw new Error(`Jina Reranker returned ${response.status}`);
    }
    const json = (await response.json()) as JinaRerankResponse;
    const results = (json.results ?? [])
      .map((item, rank) => {
        const document = documents[item.index];
        if (!document) {
          return null;
        }
        return {
          sourceKey: document.sourceKey,
          score: item.relevance_score ?? 0,
          rank: rank + 1,
        };
      })
      .filter((item): item is RerankResult => Boolean(item));
    await writeCachedJson(ctx, "jina_rerank", cacheKey, results);
    return results;
  } catch (error) {
    const results = fallbackRerank(args.query, documents, topN);
    await writeCachedJson(ctx, "jina_rerank", cacheKey, results, readableError(error));
    return results;
  }
}

export async function lookupDoiProvider(
  ctx: ActionCtx,
  args: { ownerUserId: string; doi: string },
): Promise<ExternalCandidate[]> {
  const doi = normalizeDoi(args.doi);
  if (!doi) {
    return [];
  }

  const cached: ExternalCandidate[] | null = await readCachedCandidates(ctx, "crossref", doi);
  if (cached) {
    return cached;
  }
  // Cache miss → charge the cost gate before the network call (AUD-04).
  await limitExternal(ctx, args.ownerUserId, "crossref");

  try {
    const url = new URL(`${CROSSREF_ENDPOINT}/${encodeURIComponent(doi)}`);
    const mailto = process.env.CROSSREF_MAILTO;
    if (mailto) {
      url.searchParams.set("mailto", mailto);
    }
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": researchUserAgent(),
      },
    });
    if (!response.ok) {
      throw new Error(`Crossref returned ${response.status}`);
    }
    const json = (await response.json()) as CrossrefWorkResponse;
    const item = json.message;
    const candidates: ExternalCandidate[] = item
      ? [crossrefToCandidate(item)].filter(
          (candidate): candidate is ExternalCandidate => Boolean(candidate),
        )
      : [];
    await writeCachedCandidates(ctx, "crossref", doi, candidates);
    return candidates;
  } catch (error) {
    const failure = providerFailure("doi", readableError(error));
    await writeCachedCandidates(ctx, "crossref", doi, failure, readableError(error));
    return failure;
  }
}

export async function searchArxivProvider(
  ctx: ActionCtx,
  args: { ownerUserId: string; query: string; limit?: number },
): Promise<ExternalCandidate[]> {
  const query = args.query.trim();
  if (!query) {
    return [];
  }
  const cacheKey = normalizeKey(`${query}:${args.limit ?? 5}`);
  const cached: ExternalCandidate[] | null = await readCachedCandidates(ctx, "arxiv", cacheKey);
  if (cached) {
    return cached;
  }
  // Cache miss → charge the cost gate (and pace arXiv) before the network call (AUD-04).
  await limitExternal(ctx, args.ownerUserId, "arxiv");

  try {
    const url = new URL(ARXIV_ENDPOINT);
    url.searchParams.set("search_query", query.match(/^\d{4}\.\d{4,5}/) ? `id:${query}` : `all:${query}`);
    url.searchParams.set("max_results", String(Math.min(args.limit ?? 5, 8)));
    url.searchParams.set("sortBy", "relevance");
    url.searchParams.set("sortOrder", "descending");

    const response = await fetch(url, {
      headers: { Accept: "application/atom+xml", "User-Agent": researchUserAgent() },
    });
    if (!response.ok) {
      throw new Error(`arXiv returned ${response.status}`);
    }
    const feed = xmlParser.parse(await response.text()) as ArxivFeedShape;
    const candidates = asArray(feed.feed?.entry)
      .map(arxivToCandidate)
      .filter((item): item is ExternalCandidate => Boolean(item));
    await writeCachedCandidates(ctx, "arxiv", cacheKey, candidates);
    return candidates;
  } catch (error) {
    const failure = providerFailure("arxiv", readableError(error));
    await writeCachedCandidates(ctx, "arxiv", cacheKey, failure, readableError(error));
    return failure;
  }
}

export async function getUrlContentProvider(
  ctx: ActionCtx,
  args: { ownerUserId: string; url: string },
): Promise<{ title: string; url: string; text: string; snippet: string }> {
  const read = await readWithExaContents(ctx, args);
  if (!read.ok) {
    throw new ConvexError(read.failureReason ?? "Exa content read failed");
  }
  return {
    title: read.title,
    url: read.url,
    text: read.markdown,
    snippet: read.snippet,
  };
}

export async function readWithExaContents(
  ctx: ActionCtx,
  args: { ownerUserId: string; url: string },
): Promise<JinaReadResult> {
  const exa = getExaClient();
  if (!exa) {
    return readFailure(args.url, "EXA_API_KEY is not configured");
  }
  const cacheKey = normalizeKey(args.url);
  const cached: JinaReadResult | null = await readCachedJson(ctx, "exa", `contents:${cacheKey}`);
  if (cached) {
    return cached;
  }
  // Cache miss → charge the cost gate before the network call (AUD-04).
  await limitExternal(ctx, args.ownerUserId, "exa");
  try {
    const response = await exa.getContents([args.url], {
      text: { maxCharacters: 18_000 },
      highlights: true,
      summary: true,
    });
    const result = response.results[0];
    const text = trimForSnippet(result?.text, 18_000);
    const read = {
      ok: Boolean(text || result?.summary || result?.highlights?.length),
      title: result?.title || args.url,
      url: result?.url || args.url,
      markdown: text,
      snippet:
        trimForSnippet(result?.summary) ||
        trimForSnippet(result?.highlights?.join(" ")) ||
        trimForSnippet(result?.text, 1_500),
      failureReason: text || result?.summary || result?.highlights?.length ? undefined : "Exa returned empty content",
    };
    await writeCachedJson(ctx, "exa", `contents:${cacheKey}`, read, read.ok ? undefined : read.failureReason);
    return read;
  } catch (error) {
    const read = readFailure(args.url, readableError(error));
    await writeCachedJson(ctx, "exa", `contents:${cacheKey}`, read, read.failureReason);
    return read;
  }
}

async function limitExternal(ctx: ActionCtx, ownerUserId: string, provider: Provider) {
  const billing = await ctx.runMutation(
    internal.billing.entitlements.consumeCreditsInternal,
    {
      ownerUserId,
      feature: "external_search",
      provider,
      credits: provider === "crossref" || provider === "arxiv" ? 1 : undefined,
    },
  );
  if (!billing.ok) {
    throw new ConvexError(billing.reason);
  }
  // Per-user fan-out gate applies to every provider (fairness across users).
  const perUser = await rateLimiter.check(ctx, "externalSearchPerUser", {
    key: ownerUserId,
  });
  // arXiv is paced (see paceArxiv), not gated by a fail-fast check.
  const providerOk =
    provider === "arxiv"
      ? true
      : (await providerRateCheck(ctx, ownerUserId, provider)).ok;
  if (!perUser.ok || !providerOk) {
    throw new ConvexError("External provider is rate limited");
  }
  await rateLimiter.limit(ctx, "externalSearchPerUser", { key: ownerUserId });
  if (provider === "arxiv") {
    await paceArxiv(ctx);
  } else {
    await providerRateLimit(ctx, ownerUserId, provider);
  }
}

// arXiv asks for at most 1 request / 3s GLOBALLY (per client/IP). Rather than
// reject a burst — which surfaced as a hard error and blocked unrelated users
// (AUD-14) — reserve the next global slot and wait for it, so the caller
// experiences latency, not failure. If too many requests are already queued
// ahead (beyond the bounded wait), surface as rate-limited so the deep-research
// loop falls back to OpenAlex/Crossref for the same metadata instead of stalling.
const ARXIV_MAX_PACE_MS = 6_000;

async function paceArxiv(ctx: ActionCtx) {
  const status = await rateLimiter.limit(ctx, "arxivSearchGlobal", {
    reserve: true,
  });
  const waitMs = status.ok ? (status.retryAfter ?? 0) : 0;
  if (waitMs > ARXIV_MAX_PACE_MS) {
    throw new ConvexError("External provider is rate limited");
  }
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

function providerRateCheck(ctx: ActionCtx, ownerUserId: string, provider: Provider) {
  if (provider === "exa") {
    return rateLimiter.check(ctx, "exaSearchPerUser", { key: ownerUserId });
  }
  if (provider === "crossref") {
    return rateLimiter.check(ctx, "crossrefLookupGlobal");
  }
  if (provider === "arxiv") {
    return rateLimiter.check(ctx, "arxivSearchGlobal");
  }
  if (provider === "jina_read") {
    return rateLimiter.check(ctx, "jinaReadPerUser", { key: ownerUserId });
  }
  if (provider === "jina_rerank") {
    return rateLimiter.check(ctx, "jinaRerankPerUser", { key: ownerUserId });
  }
  return rateLimiter.check(ctx, "jinaSearchPerUser", { key: ownerUserId });
}

function providerRateLimit(ctx: ActionCtx, ownerUserId: string, provider: Provider) {
  if (provider === "exa") {
    return rateLimiter.limit(ctx, "exaSearchPerUser", { key: ownerUserId });
  }
  if (provider === "crossref") {
    return rateLimiter.limit(ctx, "crossrefLookupGlobal");
  }
  if (provider === "arxiv") {
    return rateLimiter.limit(ctx, "arxivSearchGlobal");
  }
  if (provider === "jina_read") {
    return rateLimiter.limit(ctx, "jinaReadPerUser", { key: ownerUserId });
  }
  if (provider === "jina_rerank") {
    return rateLimiter.limit(ctx, "jinaRerankPerUser", { key: ownerUserId });
  }
  return rateLimiter.limit(ctx, "jinaSearchPerUser", { key: ownerUserId });
}

export async function readCachedCandidates(
  ctx: ActionCtx,
  provider: Provider,
  cacheKey: string,
): Promise<ExternalCandidate[] | null> {
  const cached: { valueJson: string } | null = await ctx.runQuery(
    internal.agent.providers.externalProviders.getCache,
    {
    provider,
    cacheKey,
    },
  );
  if (!cached) {
    return null;
  }
  try {
    return JSON.parse(cached.valueJson) as ExternalCandidate[];
  } catch {
    return null;
  }
}

export async function writeCachedCandidates(
  ctx: ActionCtx,
  provider: Provider,
  cacheKey: string,
  candidates: ExternalCandidate[],
  failureReason?: string,
) {
  await ctx.runMutation(internal.agent.providers.externalProviders.putCache, {
    provider,
    cacheKey,
    status: failureReason ? "failed" : candidates.length > 0 ? "ready" : "empty",
    valueJson: JSON.stringify(candidates),
    failureReason,
  });
}

async function readCachedJson<T>(
  ctx: ActionCtx,
  provider: Provider,
  cacheKey: string,
): Promise<T | null> {
  const cached: { valueJson: string } | null = await ctx.runQuery(
    internal.agent.providers.externalProviders.getCache,
    { provider, cacheKey },
  );
  if (!cached) {
    return null;
  }
  try {
    return JSON.parse(cached.valueJson) as T;
  } catch {
    return null;
  }
}

async function writeCachedJson(
  ctx: ActionCtx,
  provider: Provider,
  cacheKey: string,
  value: unknown,
  failureReason?: string,
) {
  await ctx.runMutation(internal.agent.providers.externalProviders.putCache, {
    provider,
    cacheKey,
    status: failureReason ? "failed" : "ready",
    valueJson: JSON.stringify(value),
    failureReason,
  });
}

function candidate(args: ExternalCandidate): ExternalCandidate {
  return args;
}

function providerFailure(origin: SourceOrigin, reason: string, provider?: string): ExternalCandidate[] {
  return [
    {
      origin,
      provider,
      evidenceStrength: "weak",
      title: "Provider unavailable",
      locator: reason,
      snippet: `Source lookup failed: ${reason}`,
      metadataJson: JSON.stringify({ providerFailure: true, reason }),
    },
  ];
}

export function providerFailureReason(candidate: ExternalCandidate) {
  const metadata = candidate.metadataJson ? parseJson(candidate.metadataJson) : null;
  if (isRecord(metadata) && metadata.providerFailure === true) {
    return stringValue(metadata.reason) || candidate.locator;
  }
  return candidate.title === "Provider unavailable" ? candidate.locator : null;
}

function parseJinaSearchResponse(text: string, limit: number): ExternalCandidate[] {
  const json = parseJson(text);
  const jsonItems = extractJsonSearchItems(json);
  if (jsonItems.length > 0) {
    return jsonItems.slice(0, limit).map((item) =>
      candidate({
        origin: "web",
        provider: "jina_search",
        evidenceStrength: "medium",
        title: item.title || item.url || "Jina Search result",
        locator: item.url || item.title || "jina-search",
        url: item.url,
        snippet: trimForSnippet(item.content || item.description || item.snippet || "Jina Search result.", 1_200),
      }),
    );
  }

  const blocks = [...text.matchAll(/(?:^|\n)Title:\s*(.+?)\nURL Source:\s*(\S+)(?:\nMarkdown Content:\s*([\s\S]*?))?(?=\nTitle:|\n\nTitle:|$)/g)];
  if (blocks.length > 0) {
    return blocks.slice(0, limit).map((match) =>
      candidate({
        origin: "web",
        provider: "jina_search",
        evidenceStrength: "medium",
        title: collapse(match[1] ?? match[2] ?? "Jina Search result"),
        locator: match[2] ?? "jina-search",
        url: match[2],
        snippet: trimForSnippet(match[3] ?? "Jina Search result.", 1_200),
      }),
    );
  }

  return [
    candidate({
      origin: "web",
      provider: "jina_search",
      evidenceStrength: "weak",
      title: "Jina Search result",
      locator: "jina-search",
      snippet: trimForSnippet(text, 1_200) || "Jina Search returned no readable result.",
    }),
  ];
}

function buildJinaQuery(args: SearchCandidateOptions) {
  const query = args.query.trim();
  const siteFilters = (cleanDomains(args.siteDomains) ?? [])
    .map((domain) => `site:${domain}`)
    .join(" OR ");
  const excludeFilters = (cleanDomains(args.excludeDomains) ?? [])
    .map((domain) => `-site:${domain}`)
    .join(" ");
  return [siteFilters ? `(${siteFilters})` : "", query, excludeFilters].filter(Boolean).join(" ").trim();
}

function cleanDomains(domains?: string[]) {
  const cleaned = domains
    ?.map((domain) => domain.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").trim().toLowerCase())
    .filter(Boolean);
  return cleaned && cleaned.length > 0 ? cleaned : undefined;
}

function parseJinaReaderResponse(text: string, requestedUrl: string): JinaReadResult {
  const json = parseJson(text);
  if (isRecord(json)) {
    const data = isRecord(json.data) ? json.data : json;
    const markdown = stringValue(data.content) || stringValue(data.markdown) || stringValue(data.text) || text;
    const url = stringValue(data.url) || requestedUrl;
    return {
      ok: true,
      title: stringValue(data.title) || url,
      url,
      markdown,
      snippet: trimForSnippet(markdown, 1_500),
    };
  }

  const title = text.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? requestedUrl;
  const sourceUrl = text.match(/^URL Source:\s*(.+)$/m)?.[1]?.trim() ?? requestedUrl;
  const markdown = text.replace(/^Title:.*$/m, "").replace(/^URL Source:.*$/m, "").replace(/^Markdown Content:\s*/m, "").trim();
  return {
    ok: true,
    title,
    url: sourceUrl,
    markdown,
    snippet: trimForSnippet(markdown, 1_500),
  };
}

function readFailure(url: string, reason: string): JinaReadResult {
  return {
    ok: false,
    title: url || "Read failed",
    url,
    markdown: "",
    snippet: `Jina Reader failed: ${reason}`,
    failureReason: reason,
  };
}

function fallbackRerank(query: string, documents: RerankInput[], topN: number): RerankResult[] {
  const terms = new Set(query.toLowerCase().split(/\W+/).filter((term) => term.length > 2));
  return documents
    .map((document) => {
      const text = `${document.title} ${document.text}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (text.includes(term)) {
          score += 1;
        }
      }
      return { sourceKey: document.sourceKey, score, rank: 0 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((result, index) => ({ ...result, rank: index + 1 }));
}

function jinaHeaders(headers: Record<string, string>) {
  const apiKey = process.env.JINA_API_KEY;
  return apiKey ? { ...headers, Authorization: `Bearer ${apiKey}` } : headers;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractJsonSearchItems(json: unknown): Array<{ title?: string; url?: string; content?: string; description?: string; snippet?: string }> {
  if (!isRecord(json)) {
    return [];
  }
  const data = Array.isArray(json.data) ? json.data : Array.isArray(json.results) ? json.results : [];
  return data.filter(isRecord).map((item) => ({
    title: stringValue(item.title),
    url: stringValue(item.url) || stringValue(item.link),
    content: stringValue(item.content) || stringValue(item.markdown) || stringValue(item.text),
    description: stringValue(item.description),
    snippet: stringValue(item.snippet),
  }));
}

type CrossrefWorkResponse = { message?: CrossrefItem };
type CrossrefItem = {
  DOI?: string;
  URL?: string;
  title?: string[];
  abstract?: string;
  author?: Array<{ given?: string; family?: string }>;
  issued?: { "date-parts"?: number[][] };
  published?: { "date-parts"?: number[][] };
  "container-title"?: string[];
};

function crossrefToCandidate(item: CrossrefItem): ExternalCandidate | null {
  const doi = normalizeDoi(item.DOI ?? "");
  const title = item.title?.find((value) => value.trim())?.trim();
  if (!doi || !title) {
    return null;
  }
  return {
    origin: "doi",
    evidenceStrength: item.abstract ? "medium" : "weak",
    title: collapse(title),
    locator: doi,
    url: item.URL || `https://doi.org/${doi}`,
    doi,
    snippet:
      trimForSnippet(stripTags(item.abstract)) ||
      trimForSnippet(item["container-title"]?.[0]) ||
      "Crossref metadata only; no abstract text was available.",
    metadataJson: JSON.stringify({
      authors: (item.author ?? [])
        .map((author) => collapse([author.given, author.family].filter(Boolean).join(" ")))
        .filter(Boolean)
        .slice(0, 6),
      year: item.published?.["date-parts"]?.[0]?.[0] ?? item.issued?.["date-parts"]?.[0]?.[0],
      venue: item["container-title"]?.find((value) => value.trim()),
      sourceLabel: item["container-title"]?.find((value) => value.trim()) ?? "Crossref",
    }),
  };
}

type ArxivFeedShape = { feed?: { entry?: ArxivEntry | ArxivEntry[] } };
type ArxivEntry = {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  updated?: string;
  author?: { name?: string } | Array<{ name?: string }>;
  link?: ArxivLink | ArxivLink[];
  "arxiv:doi"?: string | { "#text"?: string };
};
type ArxivLink = { "@_href"?: string; "@_rel"?: string; "@_title"?: string };
type JinaRerankResponse = {
  results?: Array<{ index: number; relevance_score?: number }>;
};

function arxivToCandidate(entry: ArxivEntry): ExternalCandidate | null {
  const title = collapse(entry.title ?? "");
  const url = preferredArxivUrl(entry);
  if (!title || !url) {
    return null;
  }
  const arxivId = url.split("/abs/")[1] ?? entry.id?.split("/abs/")[1];
  return {
    origin: "arxiv",
    evidenceStrength: entry.summary ? "strong" : "medium",
    title,
    locator: arxivId ?? url,
    url,
    doi: extractDoi(entry["arxiv:doi"]),
    arxivId,
    snippet: trimForSnippet(entry.summary) || "arXiv metadata result.",
    metadataJson: JSON.stringify({
      authors: asArray(entry.author)
        .map((author) => collapse(author.name ?? ""))
        .filter(Boolean)
        .slice(0, 6),
      year: entry.published ? new Date(entry.published).getUTCFullYear() : undefined,
      publicationDate: entry.published,
      pdfUrl: arxivId ? `https://arxiv.org/pdf/${arxivId}.pdf` : undefined,
      topics: ["Preprint"],
      sourceLabel: "arXiv",
    }),
  };
}

function preferredArxivUrl(entry: ArxivEntry) {
  const links = asArray(entry.link);
  return (
    links.find((link) => link["@_rel"] === "alternate")?.["@_href"] ??
    links.find((link) => link["@_href"])?.["@_href"] ??
    entry.id ??
    null
  );
}

function extractDoi(value: ArxivEntry["arxiv:doi"]) {
  if (typeof value === "string") {
    return normalizeDoi(value);
  }
  return normalizeDoi(value?.["#text"] ?? "");
}

function stripTags(value: string | undefined) {
  return value?.replace(/<[^>]+>/g, " ");
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown provider failure";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
