/**
 * ExploreService — paper search + cold-deep-link resolver (P4). Port V1 `explore.searchPapers`/
 * `getPaper`/`getOrFetchPaper`. Fase 4 = OpenAlex-backed (spine) + cache Redis `explore` +
 * cache `explore_papers`. Waterfall multi-provider akademik (arXiv/Crossref) mengisi ekor
 * keyword search halaman-1; load-more memperdalam OpenAlex via `page`. `OPENALEX_API_KEY` wajib.
 */
import type { Db } from "@aqsha/db";
import { FeedRepo, PaperCacheRepo, throwAppError } from "@aqsha/db";
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
  type PaperEnrichment,
  exploreCacheKey,
  normalizeExploreQuery,
  openAlexRecommendationQuery,
} from "./explore/model";
import { fetchPaperEnrichment } from "./explore/paperEnrichment";

const RECOMMENDATION_INTEREST_LIMIT = 6;

/** Enrichment OpenAlex single-work best-effort; null saat tak ada openalexId / fetch gagal. */
async function enrichFromOpenAlex(base: ExplorePaperDetail): Promise<PaperEnrichment | null> {
  if (!base.openalexId) return null;
  try {
    return await fetchPaperEnrichment(base.openalexId);
  } catch {
    return null;
  }
}

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
 * arXiv → Crossref. Crossref = lookupDoi bila query berupa DOI (presisi), else
 * searchCrossref (keyword). Tiap provider best-effort; status dilaporkan.
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
  await run(
    "Crossref",
    () =>
      doi
        ? ResearchService.lookupDoi({ doi })
        : ResearchService.searchCrossref({ query, limit: needed }),
    true,
  );

  return { items, statuses };
}

export const ExploreService = {
  /**
   * Provenance pdf-proxy: `true` hanya bila `url` benar-benar pdf_url yang kita ingest
   * (feed_items atau explore_papers). Guard anti-SSRF — proxy menolak URL sembarang.
   */
  async isKnownPdfUrl(db: Db, url: string): Promise<boolean> {
    if (await FeedRepo.pdfUrlExists(db, url)) return true;
    return PaperCacheRepo.pdfUrlExists(db, url);
  },

  /** Search/recommendations paper (cache → OpenAlex → cache). Port V1 explore.searchPapers. */
  async searchPapers(
    db: Db,
    ownerUserId: string,
    args: {
      query?: string;
      limit?: number;
      mode?: ExploreMode;
      fromYear?: number;
      page?: number;
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
    const page = args.page && args.page > 1 ? args.page : 1;
    const now = Date.now();

    const interestTopics =
      mode === "recommendations" && (args.interestSeed ?? true)
        ? await InterestService.topInterestTopics(db, ownerUserId, RECOMMENDATION_INTEREST_LIMIT)
        : [];
    const seedKey = interestTopics.length > 0 ? interestTopics.join(",") : undefined;
    const cacheKey = exploreCacheKey({ mode, query, limit, fromYear, page, seed: seedKey, now });

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
    let openAlexWorksCount = 0;
    let openAlexStatus: ExploreProviderStatus = { provider: "OpenAlex", status: "ready" };
    try {
      const { papers, works } = await fetchOpenAlexWorks({ query: openAlexQuery, limit, fromYear, page, now });
      items = papers;
      // Sinyal load-more dari jumlah works MENTAH OpenAlex (bukan `papers` yang sudah di-map/
      // dedup): satu work tak-terpetakan/duplikat pada halaman penuh jangan sampai menyetel
      // nextPage=null dan menyembunyikan halaman berikutnya yang sebenarnya masih ada.
      openAlexWorksCount = works.length;
      if (papers.length === 0) openAlexStatus = { provider: "OpenAlex", status: "fallback" };
    } catch (error) {
      openAlexStatus = {
        provider: "OpenAlex",
        status: "error",
        message: error instanceof Error ? error.message : "OpenAlex failed.",
      };
    }

    // Waterfall fill (Fase 8): hanya untuk keyword search HALAMAN-1 yang OpenAlex
    // tinggalkan pendek. arXiv/Crossref tak bercursor → halaman berikutnya (load-more)
    // memperdalam OpenAlex murni (cegah duplikat + hemat call eksternal).
    const providerStatus: ExploreProviderStatus[] = [openAlexStatus];
    if (mode === "search" && query && page === 1 && items.length < limit) {
      const fill = await waterfallFill(query, fromYear, limit - items.length);
      items = dedupeExplorePapers([...items, ...fill.items], limit);
      providerStatus.push(...fill.statuses);
    } else {
      providerStatus.push(
        { provider: "arXiv", status: "skipped" },
        { provider: "Crossref", status: "skipped" },
      );
    }

    // Load-more: OpenAlex mengisi penuh halaman ini → kemungkinan masih ada halaman berikutnya.
    const nextPage = mode === "search" && openAlexWorksCount >= limit ? page + 1 : null;

    const response: ExploreSearchResponse = {
      items,
      mode,
      query,
      providerStatus,
      generatedAt: now,
      cached: false,
      nextPage,
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
   * Detail paper untuk reader: cache/cold-resolve (getOrFetchPaper) + enrichment OpenAlex
   * single-work (referensi, dikutip-oleh, tren sitasi, afiliasi, dst.) best-effort & Redis-cached.
   * `enriched` absen bila tak ada `openalexId` atau fetch gagal — reader tetap render base.
   */
  async getPaperDetail(
    db: Db,
    key: string,
    opts?: { fetchOnMiss?: boolean },
  ): Promise<ExplorePaperDetail | null> {
    const base = await this.getOrFetchPaper(db, key, opts);
    if (!base) return null;
    const enriched = await enrichFromOpenAlex(base);
    return enriched ? { ...base, enriched } : base;
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
