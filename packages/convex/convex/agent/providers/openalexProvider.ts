import { ConvexError } from "convex/values";
import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import type { ExploreCandidateMetadata } from "../../explore/validators";
import { rateLimiter } from "../../limits";
import { normalizeDoi } from "../../lib/identifiers";
import {
  collapse,
  firstNonEmpty,
  normalizeKey,
  numberOrUndefined,
  uniqueCompact,
} from "../../lib/text";
import {
  readCachedCandidates,
  writeCachedCandidates,
  type ExternalCandidate,
} from "./externalProviders";
import { trimForSnippet } from "../research/sourceCandidates";
import { researchUserAgent } from "./userAgent";

const OPENALEX_ENDPOINT = "https://api.openalex.org/works";

// Superset of every OpenAlex `works` field consumed across the codebase
// (agent explore path + paperIngest resolver). All fields optional; callers
// `as`-cast raw JSON onto this shape, so additions are purely additive.
export type OpenAlexWork = {
  id?: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  cited_by_count?: number | null;
  is_retracted?: boolean | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: OpenAlexLocation | null;
  best_oa_location?: OpenAlexLocation | null;
  locations?: OpenAlexLocation[] | null;
  open_access?: {
    is_oa?: boolean | null;
    oa_status?: string | null;
    oa_url?: string | null;
  } | null;
  authorships?: Array<{
    author?: { display_name?: string | null } | null;
    raw_author_name?: string | null;
    institutions?: Array<{ display_name?: string | null }> | null;
  }> | null;
  primary_topic?: OpenAlexTopic | null;
  topics?: OpenAlexTopic[] | null;
  ids?: { openalex?: string | null; doi?: string | null } | null;
};

type OpenAlexLocation = {
  landing_page_url?: string | null;
  pdf_url?: string | null;
  is_oa?: boolean | null;
  source?: {
    display_name?: string | null;
    host_organization_name?: string | null;
  } | null;
};

type OpenAlexTopic = {
  display_name?: string | null;
  score?: number | null;
  field?: { display_name?: string | null } | null;
  subfield?: { display_name?: string | null } | null;
};

export async function searchOpenAlexWorks(
  ctx: ActionCtx,
  args: {
    ownerUserId: string;
    query: string;
    limit?: number;
    mode?: "recommendations" | "search";
    // Lower bound on publication year. When set, only works published on or
    // after Jan 1 of this year are returned (server-side, so narrowing the
    // range refetches instead of emptying a client-side filter).
    fromYear?: number;
  },
): Promise<ExternalCandidate[]> {
  const query = args.query.trim();
  const mode = args.mode ?? (query ? "search" : "recommendations");
  const limit = Math.min(args.limit ?? 8, 25);
  const fromYear = normalizeFromYear(args.fromYear);
  const cacheKey = normalizeKey(JSON.stringify({ mode, query, limit, fromYear }));
  const cached = await readCachedCandidates(ctx, "openalex", cacheKey);
  if (cached) {
    return cached;
  }

  const apiKey = process.env.OPENALEX_API_KEY;
  if (!apiKey) {
    throw new Error("OPENALEX_API_KEY is not configured");
  }
  await limitOpenAlex(ctx, args.ownerUserId);

  const url = buildOpenAlexWorksUrl({ apiKey, query, limit, fromYear });

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": researchUserAgent() },
  });
  if (!response.ok) {
    const message = await openAlexErrorMessage(response);
    throw new Error(
      message
        ? `OpenAlex returned ${response.status}: ${message}`
        : `OpenAlex returned ${response.status}`,
    );
  }

  const json = (await response.json()) as { results?: OpenAlexWork[] };
  const candidates = (json.results ?? [])
    .map(openAlexWorkToCandidate)
    .filter((item): item is ExternalCandidate => Boolean(item));
  await writeCachedCandidates(ctx, "openalex", cacheKey, candidates);
  return candidates;
}

export function openAlexWorkToCandidate(work: OpenAlexWork): ExternalCandidate | null {
  const title = collapse(work.display_name ?? work.title ?? "");
  const openalexId = work.ids?.openalex ?? work.id;
  const doi = normalizeDoi(work.ids?.doi ?? work.doi ?? "");
  const location = work.best_oa_location ?? work.primary_location ?? null;
  const url = firstNonEmpty(
    work.open_access?.oa_url,
    location?.landing_page_url,
    doi ? `https://doi.org/${doi}` : null,
    openalexId,
  );
  if (!title || !url) {
    return null;
  }

  const topics = uniqueCompact([
    work.primary_topic?.display_name,
    work.primary_topic?.subfield?.display_name,
    work.primary_topic?.field?.display_name,
    ...(work.topics ?? []).map((topic) => topic.display_name),
  ]).slice(0, 5);
  const abstract = reconstructOpenAlexAbstract(work.abstract_inverted_index);
  const metadata: ExploreCandidateMetadata = {
    authors: (work.authorships ?? [])
      .map((authorship) =>
        collapse(authorship.author?.display_name ?? authorship.raw_author_name ?? ""),
      )
      .filter(Boolean)
      .slice(0, 6),
    year: numberOrUndefined(work.publication_year),
    publicationDate: work.publication_date ?? undefined,
    venue: collapse(location?.source?.display_name ?? "") || undefined,
    citedByCount: numberOrUndefined(work.cited_by_count),
    isOpenAccess: Boolean(work.open_access?.is_oa ?? location?.is_oa),
    pdfUrl: location?.pdf_url ?? undefined,
    openalexId: openalexId ?? undefined,
    topics,
    score: numberOrUndefined(work.primary_topic?.score),
    sourceLabel: location?.source?.display_name ?? "OpenAlex",
  };

  return {
    origin: doi ? "doi" : "web",
    provider: "openalex",
    evidenceStrength: abstract ? "strong" : "medium",
    title,
    locator: doi || openalexId || url,
    url,
    doi: doi || undefined,
    snippet:
      trimForSnippet(abstract, 1_200) ||
      trimForSnippet(topics.join(", "), 1_200) ||
      "OpenAlex metadata result.",
    metadataJson: JSON.stringify(metadata),
  };
}

export function buildOpenAlexWorksUrl(args: {
  apiKey: string;
  query: string;
  limit: number;
  // When true, retracted works are kept in the result set so callers can
  // surface a retraction flag (e.g. the Feed trending lane) instead of
  // silently dropping them. Defaults to false (retracted works excluded).
  includeRetracted?: boolean;
  // Lower bound on publication year. For search it adds a date filter; for
  // recommendations it replaces the default 2021 floor.
  fromYear?: number;
}) {
  const query = args.query.trim();
  const retractionFilter = args.includeRetracted ? "" : "is_retracted:false,";
  const fromYear = normalizeFromYear(args.fromYear);
  const url = new URL(OPENALEX_ENDPOINT);
  url.searchParams.set("api_key", args.apiKey);
  url.searchParams.set("per_page", String(args.limit));
  url.searchParams.set("select", openAlexSelectFields.join(","));
  if (query) {
    const dateFilter = fromYear ? `,from_publication_date:${fromYear}-01-01` : "";
    url.searchParams.set("filter", `${retractionFilter}is_paratext:false${dateFilter}`);
    url.searchParams.set("search", query);
    url.searchParams.set("sort", "relevance_score:desc");
  } else {
    url.searchParams.set("sort", "cited_by_count:desc");
    url.searchParams.set(
      "filter",
      `${retractionFilter}is_paratext:false,from_publication_date:${fromYear ?? 2021}-01-01`,
    );
  }
  return url;
}

function normalizeFromYear(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  const year = Math.floor(value);
  // Guard against nonsense values; OpenAlex coverage starts well before this.
  if (year < 1900 || year > 2100) {
    return undefined;
  }
  return year;
}

export function reconstructOpenAlexAbstract(
  invertedIndex: Record<string, number[]> | null | undefined,
) {
  if (!invertedIndex) {
    return "";
  }
  const words: string[] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const position of positions) {
      words[position] = word;
    }
  }
  return words.filter(Boolean).join(" ").trim();
}

const openAlexSelectFields = [
  "id",
  "doi",
  "title",
  "display_name",
  "publication_year",
  "publication_date",
  "cited_by_count",
  "is_retracted",
  "abstract_inverted_index",
  "primary_location",
  "best_oa_location",
  "open_access",
  "authorships",
  "primary_topic",
  "topics",
  "ids",
];

async function limitOpenAlex(ctx: ActionCtx, ownerUserId: string) {
  const billing = await ctx.runMutation(
    internal.billing.entitlements.consumeCreditsInternal,
    {
      ownerUserId,
      feature: "external_search",
      provider: "openalex",
    },
  );
  if (!billing.ok) {
    throw new ConvexError(billing.reason);
  }
  const checks = await Promise.all([
    rateLimiter.check(ctx, "externalSearchPerUser", { key: ownerUserId }),
    rateLimiter.check(ctx, "openAlexSearchGlobal"),
  ]);
  const blocked = checks.find((status) => !status.ok);
  if (blocked && !blocked.ok) {
    throw new ConvexError("External provider is rate limited");
  }
  await Promise.all([
    rateLimiter.limit(ctx, "externalSearchPerUser", { key: ownerUserId }),
    rateLimiter.limit(ctx, "openAlexSearchGlobal"),
  ]);
}

async function openAlexErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { message?: unknown; error?: unknown };
    return collapse(
      typeof body.message === "string"
        ? body.message
        : typeof body.error === "string"
          ? body.error
          : "",
    );
  } catch {
    return "";
  }
}

