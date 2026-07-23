import { normalizeDoi } from "../papers/identifiers";
import { contactEmail, fetchWithRetry, userAgent } from "../papers/http";
import { reconstructOpenAlexAbstract } from "../papers/providers";
import { collapse, firstNonEmpty, numberOrUndefined, uniqueCompact } from "../lib/text";
import { canonicalPaperKey } from "../explore/model";
import { toOpenAlexFilter } from "./catalog";
import type {
  LiteratureAutocompleteItem,
  LiteratureEntityKind,
  LiteratureFilterClause,
  LiteraturePaper,
  LiteratureSortId,
} from "./types";

const OPENALEX_WORKS = "https://api.openalex.org/works";

export const LITERATURE_WORK_SELECT = [
  "id",
  "ids",
  "display_name",
  "title",
  "doi",
  "publication_year",
  "publication_date",
  "cited_by_count",
  "type",
  "language",
  "is_retracted",
  "abstract_inverted_index",
  "open_access",
  "best_oa_location",
  "primary_location",
  "authorships",
  "primary_topic",
  "topics",
].join(",");

const SORT_TO_OPENALEX: Record<LiteratureSortId, string> = {
  relevance: "relevance_score:desc",
  publication_date_desc: "publication_date:desc",
  publication_date_asc: "publication_date:asc",
  citations_desc: "cited_by_count:desc",
  fwci_desc: "fwci:desc",
  authors_desc: "authors_count:desc",
  references_desc: "referenced_works_count:desc",
};

type OpenAlexLocation = {
  landing_page_url?: string | null;
  pdf_url?: string | null;
  is_oa?: boolean | null;
  source?: { display_name?: string | null } | null;
};

type OpenAlexTopic = {
  display_name?: string | null;
  field?: { display_name?: string | null } | null;
  subfield?: { display_name?: string | null } | null;
};

export type OpenAlexWorkPayload = {
  id?: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  cited_by_count?: number | null;
  type?: string | null;
  language?: string | null;
  is_retracted?: boolean | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: OpenAlexLocation | null;
  best_oa_location?: OpenAlexLocation | null;
  open_access?: {
    is_oa?: boolean | null;
    oa_status?: string | null;
    oa_url?: string | null;
  } | null;
  authorships?: Array<{
    author?: { display_name?: string | null } | null;
    raw_author_name?: string | null;
  }> | null;
  primary_topic?: OpenAlexTopic | null;
  topics?: OpenAlexTopic[] | null;
  ids?: { openalex?: string | null; doi?: string | null } | null;
};

export type LiteratureWorksFetchResult = {
  items: LiteraturePaper[];
  total: number | null;
  nextCursor: string | null;
};

export function buildLiteratureWorksUrl(args: {
  apiKey: string;
  query: string;
  sort: LiteratureSortId;
  filters: LiteratureFilterClause[];
  cursor: string | null;
  limit: number;
}): URL {
  const url = new URL(OPENALEX_WORKS);
  if (args.apiKey) url.searchParams.set("api_key", args.apiKey);
  const email = contactEmail();
  if (email) url.searchParams.set("mailto", email);
  url.searchParams.set("search", args.query);
  url.searchParams.set("filter", toOpenAlexFilter(args.filters));
  url.searchParams.set("sort", SORT_TO_OPENALEX[args.sort]);
  url.searchParams.set("per_page", String(args.limit));
  url.searchParams.set("cursor", args.cursor ?? "*");
  url.searchParams.set("select", LITERATURE_WORK_SELECT);
  return url;
}

export function mapOpenAlexWork(work: OpenAlexWorkPayload): LiteraturePaper | null {
  const title = collapse(work.display_name ?? work.title ?? "");
  if (!title) return null;

  const openalexId = work.ids?.openalex ?? work.id ?? null;
  const doi = normalizeDoi(work.ids?.doi ?? work.doi ?? "") || null;
  const location = work.best_oa_location ?? work.primary_location ?? null;
  const pdfUrl = firstNonEmpty(work.best_oa_location?.pdf_url, location?.pdf_url) || null;
  const url =
    firstNonEmpty(
      work.open_access?.oa_url,
      location?.landing_page_url,
      doi ? `https://doi.org/${doi}` : null,
      openalexId,
    ) || null;

  const abstract = reconstructOpenAlexAbstract(work.abstract_inverted_index);
  const topics = uniqueCompact([
    work.primary_topic?.display_name,
    work.primary_topic?.subfield?.display_name,
    work.primary_topic?.field?.display_name,
    ...(work.topics ?? []).map((topic) => topic.display_name),
  ]).slice(0, 5);

  const key = canonicalPaperKey({
    doi: doi ?? undefined,
    url: url ?? undefined,
    locator: openalexId ?? undefined,
    title,
  });

  return {
    key,
    title,
    snippet: abstract ? abstract.slice(0, 1200) : topics.length > 0 ? topics.join(", ") : null,
    doi,
    url,
    pdfUrl,
    hasPdf: Boolean(pdfUrl),
    authors: (work.authorships ?? [])
      .map((authorship) =>
        collapse(authorship.author?.display_name ?? authorship.raw_author_name ?? ""),
      )
      .filter(Boolean)
      .slice(0, 8),
    year: numberOrUndefined(work.publication_year) ?? null,
    publicationDate: work.publication_date ?? null,
    venue: collapse(location?.source?.display_name ?? "") || null,
    citedByCount: numberOrUndefined(work.cited_by_count) ?? null,
    isOpenAccess: Boolean(work.open_access?.is_oa),
    oaStatus: work.open_access?.oa_status ?? null,
    workType: work.type ?? null,
    language: work.language ?? null,
    isRetracted: Boolean(work.is_retracted),
    topics,
  };
}

export async function fetchLiteratureWorks(args: {
  apiKey: string;
  query: string;
  sort: LiteratureSortId;
  filters: LiteratureFilterClause[];
  cursor: string | null;
  limit: number;
}): Promise<LiteratureWorksFetchResult> {
  const url = buildLiteratureWorksUrl(args);
  const response = await fetchWithRetry(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": userAgent() },
  });
  if (!response.ok) {
    throw new Error(`OpenAlex returned ${response.status}`);
  }

  const json = (await response.json()) as {
    results?: OpenAlexWorkPayload[];
    meta?: { count?: number; next_cursor?: string | null };
  };

  const items = (json.results ?? [])
    .map(mapOpenAlexWork)
    .filter((item): item is LiteraturePaper => Boolean(item));

  const nextCursor =
    typeof json.meta?.next_cursor === "string" && json.meta.next_cursor.length > 0
      ? json.meta.next_cursor
      : null;

  return {
    items,
    total: typeof json.meta?.count === "number" ? json.meta.count : null,
    nextCursor,
  };
}

const AUTOCOMPLETE_ENTITY_KINDS = new Set<LiteratureEntityKind>([
  "works",
  "authors",
  "sources",
  "institutions",
  "concepts",
  "publishers",
  "funders",
  "topics",
  "keywords",
]);

const LIST_SEARCH_KINDS = new Set<LiteratureEntityKind>(["topics", "keywords"]);

export function isLiteratureEntityKind(value: string): value is LiteratureEntityKind {
  return AUTOCOMPLETE_ENTITY_KINDS.has(value as LiteratureEntityKind);
}

export async function fetchLiteratureAutocomplete(
  kind: LiteratureEntityKind,
  query: string,
  apiKey: string,
): Promise<LiteratureAutocompleteItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  if (!isLiteratureEntityKind(kind)) return [];

  const url = LIST_SEARCH_KINDS.has(kind)
    ? new URL(`https://api.openalex.org/${kind}`)
    : new URL(`https://api.openalex.org/autocomplete/${kind}`);

  if (apiKey) url.searchParams.set("api_key", apiKey);
  const email = contactEmail();
  if (email) url.searchParams.set("mailto", email);

  if (LIST_SEARCH_KINDS.has(kind)) {
    url.searchParams.set("search", q);
    url.searchParams.set("per_page", "10");
  } else {
    url.searchParams.set("q", q);
  }

  const response = await fetchWithRetry(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": userAgent() },
  });
  if (!response.ok) return [];

  const json = (await response.json()) as {
    results?: Array<{
      id?: string | null;
      display_name?: string | null;
      hint?: string | null;
      cited_by_count?: number | null;
      entity_type?: string | null;
    }>;
  };

  return (json.results ?? [])
    .map((item): LiteratureAutocompleteItem | null => {
      const id = typeof item.id === "string" ? item.id : null;
      const label = collapse(item.display_name ?? "");
      if (!id || !label) return null;
      return {
        id,
        label,
        hint: item.hint?.trim() || (item.cited_by_count != null ? `${item.cited_by_count} sitasi` : null),
        entityType: kind,
      };
    })
    .filter((item): item is LiteratureAutocompleteItem => Boolean(item))
    .slice(0, 10);
}
