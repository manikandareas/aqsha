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
import { extractDoi } from "./papers/identifiers";
import { ResearchService, type ResearchCandidate } from "./research";
import { InterestService } from "./interest.service";
import { PaperCacheService } from "./paper-cache.service";
import {
  canonicalPaperKey,
  clampExploreLimit,
  clampFromYear,
  dedupeExplorePapers,
  deriveKeyProbe,
  type ExploreMode,
  type ExplorePaperDetail,
  type ExplorePaperInput,
  type ExploreProvider,
  type ExploreProviderStatus,
  type ExploreSearchResponse,
  exploreCacheKey,
  normalizeExploreQuery,
  openAlexRecommendationQuery,
} from "./explore/model";

const RECOMMENDATION_INTEREST_LIMIT = 6;

/** ResearchCandidate (web/arxiv/doi) → ExplorePaperInput untuk dedup + cache explore_papers. */
function candidateToPaperInput(candidate: ResearchCandidate, provider: ExploreProvider): ExplorePaperInput {
  let meta: {
    authors?: string[];
    year?: number;
    publicationDate?: string;
    venue?: string;
    pdfUrl?: string;
    isOpenAccess?: boolean;
  } = {};
  if (candidate.metadataJson) {
    try {
      meta = JSON.parse(candidate.metadataJson) as typeof meta;
    } catch {
      // metadata best-effort
    }
  }
  return {
    key: canonicalPaperKey({
      doi: candidate.doi,
      arxivId: candidate.arxivId,
      url: candidate.url,
      locator: candidate.locator,
      title: candidate.title,
    }),
    title: candidate.title,
    snippet: candidate.snippet,
    url: candidate.url ?? candidate.locator,
    pdfUrl: meta.pdfUrl,
    doi: candidate.doi,
    arxivId: candidate.arxivId,
    provider,
    sourceLabel: meta.venue ?? provider,
    authors: Array.isArray(meta.authors) ? meta.authors : [],
    year: meta.year,
    publicationDate: meta.publicationDate,
    venue: meta.venue,
    isOpenAccess: meta.isOpenAccess,
    topics: [],
  };
}

/**
 * Waterfall fill (Fase 8): saat OpenAlex belum mengisi `limit`, lengkapi dari
 * arXiv → Jina → Crossref(DOI). Tiap provider best-effort; status dilaporkan.
 * Mengembalikan item gabungan (belum di-dedup) + status per-provider.
 */
async function waterfallFill(
  query: string,
  fromYear: number | undefined,
  needed: number,
): Promise<{ items: ExplorePaperInput[]; statuses: ExploreProviderStatus[] }> {
  const items: ExplorePaperInput[] = [];
  const statuses: ExploreProviderStatus[] = [];

  const run = async (
    provider: ExploreProvider,
    fetcher: () => Promise<ResearchCandidate[]>,
    enabled: boolean,
  ) => {
    if (!enabled || items.length >= needed) {
      statuses.push({ provider, status: "skipped" });
      return;
    }
    try {
      const candidates = await fetcher();
      const mapped = candidates
        .map((c) => candidateToPaperInput(c, provider))
        .filter((p) => (fromYear ? !p.year || p.year >= fromYear : true));
      items.push(...mapped);
      statuses.push({ provider, status: mapped.length > 0 ? "ready" : "fallback" });
    } catch (error) {
      statuses.push({
        provider,
        status: "error",
        message: error instanceof Error ? error.message : `${provider} failed.`,
      });
    }
  };

  const doi = extractDoi(query);
  await run("arXiv", () => ResearchService.searchArxiv({ query, limit: needed }), true);
  await run("Jina", () => ResearchService.searchWeb({ query, limit: needed }), true);
  await run("Crossref", () => ResearchService.lookupDoi({ doi: doi ?? "" }), Boolean(doi));

  return { items, statuses };
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

    // Waterfall fill (Fase 8): only for keyword search that OpenAlex left short.
    const providerStatus: ExploreProviderStatus[] = [openAlexStatus];
    if (mode === "search" && query && items.length < limit) {
      const fill = await waterfallFill(query, fromYear, limit - items.length);
      items = dedupeExplorePapers([...items, ...fill.items], limit);
      providerStatus.push(...fill.statuses);
    } else {
      providerStatus.push(
        { provider: "arXiv", status: "skipped" },
        { provider: "Jina", status: "skipped" },
        { provider: "Crossref", status: "skipped" },
      );
    }

    const response: ExploreSearchResponse = {
      items,
      mode,
      query,
      providerStatus,
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
