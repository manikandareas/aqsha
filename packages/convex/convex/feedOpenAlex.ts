import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { rateLimiter } from "./limits";
import {
  buildOpenAlexWorksUrl,
  openAlexWorkToCandidate,
  type OpenAlexWork,
} from "./agent/openalexProvider";
import type { ExternalCandidate } from "./agent/externalProviders";

// Service-path OpenAlex fetch shared by the Feed crons (trending papers,
// claim-supporting papers, consensus). Unlike `searchOpenAlexWorks`, this does
// NOT consume per-user credits — there is no authenticated user on a cron — it
// only honours the global `openAlexSearchGlobal` bucket and the 24h cache.
// Callers get the raw `works` too so they can read fields the candidate shape
// drops (e.g. `is_retracted`).
export async function fetchOpenAlexWorksService(
  ctx: ActionCtx,
  args: {
    query: string;
    limit: number;
    includeRetracted?: boolean;
  },
): Promise<{ candidates: ExternalCandidate[]; works: OpenAlexWork[] }> {
  const query = args.query.trim();
  const limit = Math.min(Math.max(args.limit, 1), 50);
  const includeRetracted = args.includeRetracted ?? false;
  const dateBucket = new Date().toISOString().slice(0, 10);
  const cacheKey = `feed:works:${includeRetracted ? "ret" : "noret"}:${limit}:${query}:${dateBucket}`;

  const cached: { valueJson: string } | null = await ctx.runQuery(
    internal.agent.externalProviders.getCache,
    { provider: "openalex", cacheKey },
  );
  if (cached) {
    try {
      const works = JSON.parse(cached.valueJson) as OpenAlexWork[];
      return { works, candidates: worksToCandidates(works) };
    } catch {
      // fall through to refetch
    }
  }

  const apiKey = process.env.OPENALEX_API_KEY;
  if (!apiKey) {
    throw new Error("OPENALEX_API_KEY is not configured");
  }

  const status = await rateLimiter.check(ctx, "openAlexSearchGlobal");
  if (!status.ok) {
    // Soft-fail: callers treat an empty result as "nothing new this run".
    return { candidates: [], works: [] };
  }
  await rateLimiter.limit(ctx, "openAlexSearchGlobal");

  const url = buildOpenAlexWorksUrl({ apiKey, query, limit, includeRetracted });
  url.searchParams.set("api_key", apiKey);
  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`OpenAlex returned ${response.status}`);
  }
  const json = (await response.json()) as { results?: OpenAlexWork[] };
  const works = json.results ?? [];

  // Cache the raw works (smaller + lets callers read is_retracted/abstract).
  await ctx.runMutation(internal.agent.externalProviders.putCache, {
    provider: "openalex",
    cacheKey,
    status: works.length > 0 ? "ready" : "empty",
    valueJson: JSON.stringify(works),
  });

  return { works, candidates: worksToCandidates(works) };
}

function worksToCandidates(works: OpenAlexWork[]): ExternalCandidate[] {
  return works
    .map(openAlexWorkToCandidate)
    .filter((item): item is ExternalCandidate => Boolean(item));
}

export function normalizeDoiLoose(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:/, "")
    .trim();
}

// Identifiers we can match a feed paper back to a raw work by.
export function workIdentifiers(work: OpenAlexWork): string[] {
  const ids: string[] = [];
  const openalexId = work.ids?.openalex ?? work.id ?? undefined;
  if (openalexId) ids.push(openalexId);
  const doi = normalizeDoiLoose(work.ids?.doi ?? work.doi ?? undefined);
  if (doi) ids.push(doi);
  return ids;
}
