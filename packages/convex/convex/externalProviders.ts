import Exa from "exa-js";
import { XMLParser } from "fast-xml-parser";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { rateLimiter } from "./limits";
import type { SourceCandidate, SourceOrigin } from "./sourceCandidates";
import { trimForSnippet } from "./sourceCandidates";

const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const CROSSREF_ENDPOINT = "https://api.crossref.org/works";
const ARXIV_ENDPOINT = "https://export.arxiv.org/api/query";
const USER_AGENT = "AqshaResearch/phase3 (https://aqsha.local; mailto optional)";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

type Provider = "crossref" | "arxiv" | "exa";

export type ExternalCandidate = Omit<SourceCandidate, "citationNumber">;

export const getCache = internalQuery({
  args: {
    provider: v.union(v.literal("crossref"), v.literal("arxiv"), v.literal("exa")),
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
    provider: v.union(v.literal("crossref"), v.literal("arxiv"), v.literal("exa")),
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
      expiresAt: now + CACHE_TTL_MS,
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
  await limitExternal(ctx, args.ownerUserId, "exa");
  const query = args.query.trim();
  if (!query) {
    return [];
  }

  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    return providerFailure("web", "EXA_API_KEY is not configured");
  }

  const cacheKey = normalizeKey(`${query}:${args.limit ?? 5}`);
  const cached: ExternalCandidate[] | null = await readCachedCandidates(ctx, "exa", cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const exa = new Exa(apiKey);
    const response = await exa.search(query, {
      numResults: Math.min(args.limit ?? 5, 8),
      type: "auto",
      contents: { text: { maxCharacters: 1_200 }, highlights: true },
    });
    const candidates = response.results.map((result) =>
      candidate({
        origin: "web",
        evidenceStrength: "medium",
        title: result.title || result.url,
        locator: result.url,
        url: result.url,
        snippet:
          trimForSnippet(result.text) ||
          trimForSnippet(result.highlights?.join(" ")) ||
          "No extract was available from this web result.",
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

export async function lookupDoiProvider(
  ctx: ActionCtx,
  args: { ownerUserId: string; doi: string },
): Promise<ExternalCandidate[]> {
  await limitExternal(ctx, args.ownerUserId, "crossref");
  const doi = normalizeDoi(args.doi);
  if (!doi) {
    return [];
  }

  const cached: ExternalCandidate[] | null = await readCachedCandidates(ctx, "crossref", doi);
  if (cached) {
    return cached;
  }

  try {
    const url = new URL(`${CROSSREF_ENDPOINT}/${encodeURIComponent(doi)}`);
    const mailto = process.env.CROSSREF_MAILTO;
    if (mailto) {
      url.searchParams.set("mailto", mailto);
    }
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent(),
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
  await limitExternal(ctx, args.ownerUserId, "arxiv");
  const query = args.query.trim();
  if (!query) {
    return [];
  }
  const cacheKey = normalizeKey(`${query}:${args.limit ?? 5}`);
  const cached: ExternalCandidate[] | null = await readCachedCandidates(ctx, "arxiv", cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url = new URL(ARXIV_ENDPOINT);
    url.searchParams.set("search_query", query.match(/^\d{4}\.\d{4,5}/) ? `id:${query}` : `all:${query}`);
    url.searchParams.set("max_results", String(Math.min(args.limit ?? 5, 8)));
    url.searchParams.set("sortBy", "relevance");
    url.searchParams.set("sortOrder", "descending");

    const response = await fetch(url, {
      headers: { Accept: "application/atom+xml", "User-Agent": userAgent() },
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
  await limitExternal(ctx, args.ownerUserId, "exa");
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new ConvexError("EXA_API_KEY is not configured");
  }
  const exa = new Exa(apiKey);
  const response = await exa.getContents([args.url], {
    text: { maxCharacters: 12_000 },
    highlights: true,
    summary: true,
  });
  const result = response.results[0];
  return {
    title: result?.title || args.url,
    url: result?.url || args.url,
    text: trimForSnippet(result?.text, 12_000),
    snippet:
      trimForSnippet(result?.summary) ||
      trimForSnippet(result?.highlights?.join(" ")) ||
      trimForSnippet(result?.text),
  };
}

async function limitExternal(ctx: ActionCtx, ownerUserId: string, provider: Provider) {
  const checks = await Promise.all([
    rateLimiter.check(ctx, "externalSearchPerUser", { key: ownerUserId }),
    provider === "exa"
      ? rateLimiter.check(ctx, "exaSearchPerUser", { key: ownerUserId })
      : provider === "crossref"
        ? rateLimiter.check(ctx, "crossrefLookupGlobal")
        : rateLimiter.check(ctx, "arxivSearchGlobal"),
  ]);
  const blocked = checks.find((status) => !status.ok);
  if (blocked && !blocked.ok) {
    throw new ConvexError("External provider is rate limited");
  }
  await Promise.all([
    rateLimiter.limit(ctx, "externalSearchPerUser", { key: ownerUserId }),
    provider === "exa"
      ? rateLimiter.limit(ctx, "exaSearchPerUser", { key: ownerUserId })
      : provider === "crossref"
        ? rateLimiter.limit(ctx, "crossrefLookupGlobal")
        : rateLimiter.limit(ctx, "arxivSearchGlobal"),
  ]);
}

async function readCachedCandidates(
  ctx: ActionCtx,
  provider: Provider,
  cacheKey: string,
): Promise<ExternalCandidate[] | null> {
  const cached: { valueJson: string } | null = await ctx.runQuery(
    internal.externalProviders.getCache,
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

async function writeCachedCandidates(
  ctx: ActionCtx,
  provider: Provider,
  cacheKey: string,
  candidates: ExternalCandidate[],
  failureReason?: string,
) {
  await ctx.runMutation(internal.externalProviders.putCache, {
    provider,
    cacheKey,
    status: failureReason ? "failed" : candidates.length > 0 ? "ready" : "empty",
    valueJson: JSON.stringify(candidates),
    failureReason,
  });
}

function candidate(args: ExternalCandidate): ExternalCandidate {
  return args;
}

function providerFailure(origin: SourceOrigin, reason: string): ExternalCandidate[] {
  return [
    {
      origin,
      evidenceStrength: "weak",
      title: "Provider unavailable",
      locator: reason,
      snippet: `Source lookup failed: ${reason}`,
    },
  ];
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

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function normalizeDoi(value: string) {
  return value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim().toLowerCase();
}

function normalizeKey(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function collapse(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripTags(value: string | undefined) {
  return value?.replace(/<[^>]+>/g, " ");
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown provider failure";
}

function userAgent() {
  const mailto = process.env.CROSSREF_MAILTO;
  return mailto ? `${USER_AGENT}; mailto:${mailto}` : USER_AGENT;
}
