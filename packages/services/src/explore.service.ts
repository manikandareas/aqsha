/**
 * ExploreService — paper search + cold-deep-link resolver (P4). Port V1 `explore.searchPapers`/
 * `getPaper`/`getOrFetchPaper`. Fase 4 = OpenAlex-backed (spine) + cache Redis `explore` +
 * cache `explore_papers`. Waterfall multi-provider (arXiv/Jina/Crossref) = Fase 8 augmentation
 * (status "skipped" sekarang). `OPENALEX_API_KEY` wajib.
 */
import type { Db } from "@aqsha/db";
import { throwAppError } from "@aqsha/db";
import { getCache, putCache } from "./papers/external-cache";
import { fetchOpenAlexWorks } from "./feed/openAlex";
import { InterestService } from "./interest.service";
import { PaperCacheService } from "./paper-cache.service";
import {
  clampExploreLimit,
  clampFromYear,
  deriveKeyProbe,
  type ExploreMode,
  type ExplorePaperDetail,
  type ExplorePaperInput,
  type ExploreProviderStatus,
  type ExploreSearchResponse,
  exploreCacheKey,
  normalizeExploreQuery,
  openAlexRecommendationQuery,
} from "./explore/model";

const RECOMMENDATION_INTEREST_LIMIT = 6;

/** Fase 4: provider lain belum di-wire (Fase 8). Tandai skipped untuk transparansi UI. */
function deferredProviderStatus(openAlex: ExploreProviderStatus): ExploreProviderStatus[] {
  return [
    openAlex,
    { provider: "arXiv", status: "skipped" },
    { provider: "Jina", status: "skipped" },
    { provider: "Crossref", status: "skipped" },
  ];
}

export const ExploreService = {
  /** Search/recommendations paper (cache → OpenAlex → cache). Port V1 explore.searchPapers. */
  async searchPapers(
    db: Db,
    ownerUserId: string,
    args: {
      query?: string;
      limit?: number;
      mode?: ExploreMode;
      fromYear?: number;
      interestSeed?: boolean;
    },
  ): Promise<ExploreSearchResponse> {
    const query = normalizeExploreQuery(args.query);
    const mode: ExploreMode = args.mode ?? (query ? "search" : "recommendations");
    const limit = clampExploreLimit(args.limit);
    if (limit === null) {
      throwAppError({
        message: "Limit must be a number",
        code: "explore_limit_invalid",
        severity: "warning",
        status: 400,
        field: "limit",
      });
    }
    const fromYear = clampFromYear(args.fromYear);
    const now = Date.now();

    const interestTopics =
      mode === "recommendations" && (args.interestSeed ?? true)
        ? await InterestService.topInterestTopics(db, ownerUserId, RECOMMENDATION_INTEREST_LIMIT)
        : [];
    const seedKey = interestTopics.length > 0 ? interestTopics.join(",") : undefined;
    const cacheKey = exploreCacheKey({ mode, query, limit, fromYear, seed: seedKey, now });

    const cached = await getCache("explore", cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached.valueJson) as ExploreSearchResponse;
        await PaperCacheService.upsert(db, parsed.items, now);
        return { ...parsed, cached: true };
      } catch {
        // korup → refetch
      }
    }

    const openAlexQuery = openAlexRecommendationQuery(query, interestTopics);
    let items: ExplorePaperInput[] = [];
    let openAlexStatus: ExploreProviderStatus = { provider: "OpenAlex", status: "ready" };
    try {
      const { papers } = await fetchOpenAlexWorks({ query: openAlexQuery, limit, fromYear, now });
      items = papers;
      if (papers.length === 0) openAlexStatus = { provider: "OpenAlex", status: "fallback" };
    } catch (error) {
      openAlexStatus = {
        provider: "OpenAlex",
        status: "error",
        message: error instanceof Error ? error.message : "OpenAlex failed.",
      };
    }

    const response: ExploreSearchResponse = {
      items,
      mode,
      query,
      providerStatus: deferredProviderStatus(openAlexStatus),
      generatedAt: now,
      cached: false,
    };
    await putCache("explore", cacheKey, items.length > 0 ? "ready" : "empty", JSON.stringify(response));
    await PaperCacheService.upsert(db, items, now);
    return response;
  },

  /** Baca paper by key (cache-only). Port V1 explore.getPaper. */
  async getPaper(db: Db, key: string): Promise<ExplorePaperDetail | null> {
    return PaperCacheService.getByKey(db, key);
  },

  /**
   * Resolver deep-link: cache → on-miss probe key (doi/arxiv/title) → OpenAlex → cache → re-read.
   * Port V1 getOrFetchPaper (Fase 4: OpenAlex resolver; DOI/arXiv-native cold-resolve = Fase 8).
   */
  async getOrFetchPaper(
    db: Db,
    key: string,
    opts?: { fetchOnMiss?: boolean },
  ): Promise<ExplorePaperDetail | null> {
    const cached = await PaperCacheService.getByKey(db, key);
    if (cached) return cached;
    if (opts?.fetchOnMiss === false) return null;

    const probe = deriveKeyProbe(key);
    if (!probe) return null;
    const now = Date.now();

    let papers: ExplorePaperInput[] = [];
    try {
      const { papers: found } = await fetchOpenAlexWorks({
        query: probe.doi ?? probe.query,
        limit: 8,
        now,
      });
      papers = found;
    } catch {
      // best-effort
    }
    if (papers.length === 0) return null;

    await PaperCacheService.upsert(db, papers, now);
    const match = papers.find((p) => p.key === key);
    if (match) return { ...match, lastSeenAt: now };
    // Key mungkin teresolve dari batch yang baru di-cache.
    return PaperCacheService.getByKey(db, key);
  },
};
