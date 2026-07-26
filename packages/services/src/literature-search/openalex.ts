import { contactEmail, fetchWithRetry, userAgent } from "../papers/http";
import { collapse } from "../lib/text";
import {
  LITERATURE_WORK_SELECT,
  mapOpenAlexWork,
  type LiteraturePaper,
  type OpenAlexWorkPayload,
} from "../papers/work";
import { toOpenAlexFilter } from "./catalog";
import type {
  LiteratureAutocompleteItem,
  LiteratureEntityKind,
  LiteratureFilterClause,
  LiteratureSortId,
} from "./types";

export { LITERATURE_WORK_SELECT, mapOpenAlexWork, type OpenAlexWorkPayload };

const OPENALEX_WORKS = "https://api.openalex.org/works";

const SORT_TO_OPENALEX: Record<LiteratureSortId, string> = {
  relevance: "relevance_score:desc",
  publication_date_desc: "publication_date:desc",
  publication_date_asc: "publication_date:asc",
  citations_desc: "cited_by_count:desc",
  fwci_desc: "fwci:desc",
  authors_desc: "authors_count:desc",
  references_desc: "referenced_works_count:desc",
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
