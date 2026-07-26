import type { Db } from "@aqsha/db";
import { throwAppError } from "@aqsha/db";
import { getCache, putCache } from "../papers/external-cache";
import { PaperCacheService } from "../paper-cache.service";
import { literaturePaperToExplorePaper } from "../papers/work";
import {
  normalizeLiteratureSearch,
  publicLiteratureCatalog,
  toOpenAlexFilter,
} from "./catalog";
import {
  fetchLiteratureAutocomplete,
  fetchLiteratureWorks,
  isLiteratureEntityKind,
} from "./openalex";
import type {
  LiteratureAutocompleteItem,
  LiteratureEntityKind,
  LiteratureFilterClause,
  LiteraturePaper,
  LiteratureSearchInput,
  LiteratureSearchPage,
  LiteratureSortId,
  PublicLiteratureCatalog,
} from "./types";
import { LITERATURE_SORT_IDS } from "./types";

const PROVIDER = "literature-search";
const FILTER_ORDER = new Map(
  publicLiteratureCatalog().filters.map((filter, index) => [filter.id, index]),
);

/** Replaceable fetch seam so unit tests can spy without `mock.module` pollution. */
export const literatureSearchDeps = {
  fetchWorks: fetchLiteratureWorks,
  fetchAutocomplete: fetchLiteratureAutocomplete,
};

function requireOpenAlexApiKey(): string {
  const apiKey = process.env.OPENALEX_API_KEY?.trim();
  if (!apiKey) {
    throwAppError({
      message: "OpenAlex belum dikonfigurasi.",
      code: "literature_provider_unavailable",
      severity: "error",
      status: 503,
    });
  }
  return apiKey;
}

function sortFiltersForCache(filters: LiteratureFilterClause[]): LiteratureFilterClause[] {
  return [...filters].sort((a, b) => {
    const left = FILTER_ORDER.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const right = FILTER_ORDER.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return a.id.localeCompare(b.id);
  });
}

function literatureCacheKey(args: {
  query: string;
  sort: LiteratureSortId;
  filters: LiteratureFilterClause[];
  cursor: string | null;
  limit: number;
  now?: number;
}): string {
  const dateBucket = new Date(args.now ?? Date.now()).toISOString().slice(0, 10);
  const filters = sortFiltersForCache(args.filters);
  const payload = JSON.stringify({
    q: args.query,
    sort: args.sort,
    filters,
    filter: toOpenAlexFilter(filters),
    cursor: args.cursor ?? "*",
    limit: args.limit,
    day: dateBucket,
  });
  return `literature:v1:${payload}`;
}

function parseCachedPage(valueJson: string): LiteratureSearchPage | null {
  try {
    const parsed = JSON.parse(valueJson) as LiteratureSearchPage;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return {
      items: parsed.items,
      total: typeof parsed.total === "number" ? parsed.total : null,
      nextCursor: typeof parsed.nextCursor === "string" ? parsed.nextCursor : null,
      cached: true,
    };
  } catch {
    return null;
  }
}

export const LiteratureSearchService = {
  catalog(): PublicLiteratureCatalog {
    return publicLiteratureCatalog();
  },

  async autocomplete(kind: string, q: string): Promise<LiteratureAutocompleteItem[]> {
    if (!isLiteratureEntityKind(kind)) {
      throwAppError({
        message: "Jenis autocomplete tidak dikenal (literature_autocomplete_kind_invalid).",
        code: "literature_autocomplete_kind_invalid",
        field: "kind",
      });
    }
    const query = q.trim();
    if (query.length < 2) return [];
    const apiKey = process.env.OPENALEX_API_KEY?.trim() ?? "";
    return literatureSearchDeps.fetchAutocomplete(kind as LiteratureEntityKind, query, apiKey);
  },

  async search(db: Db, input: LiteratureSearchInput): Promise<LiteratureSearchPage> {
    const normalized = normalizeLiteratureSearch(input);
    const now = Date.now();
    const cacheKey = literatureCacheKey({
      query: normalized.query,
      sort: normalized.sort,
      filters: normalized.filters,
      cursor: normalized.cursor,
      limit: normalized.limit,
      now,
    });

    const cached = await getCache(PROVIDER, cacheKey);
    if (cached) {
      const page = parseCachedPage(cached.valueJson);
      if (page) {
        await PaperCacheService.upsert(db, page.items.map(literaturePaperToExplorePaper), now);
        return page;
      }
    }

    const apiKey = requireOpenAlexApiKey();
    const live = await literatureSearchDeps.fetchWorks({
      apiKey,
      query: normalized.query,
      sort: normalized.sort,
      filters: normalized.filters,
      cursor: normalized.cursor,
      limit: normalized.limit,
    });

    const page: LiteratureSearchPage = {
      items: live.items,
      total: live.total,
      nextCursor: live.nextCursor,
      cached: false,
    };

    await putCache(
      PROVIDER,
      cacheKey,
      page.items.length > 0 ? "ready" : "empty",
      JSON.stringify(page),
    );
    await PaperCacheService.upsert(db, page.items.map(literaturePaperToExplorePaper), now);
    return page;
  },
};

export { LITERATURE_SORT_IDS };
