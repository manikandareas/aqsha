import { normalizeDoi } from "../lib/identifiers";
import {
  collapse,
  firstNonEmpty,
  normalizeKey,
  numberOrUndefined,
  trimForSnippet,
  uniqueCompact,
} from "../lib/text";
import {
  depsFetch,
  providerFailure,
  readableError,
  researchUserAgent,
  type ExternalCandidate,
  type ProviderDeps,
} from "./types";

const OPENALEX_ENDPOINT = "https://api.openalex.org/works";

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

export function reconstructOpenAlexAbstract(
  invertedIndex: Record<string, number[]> | null | undefined,
): string {
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
    metadataJson: JSON.stringify({
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
      sourceLabel: location?.source?.display_name ?? "OpenAlex",
    }),
  };
}

const OPENALEX_SELECT_FIELDS = [
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

export async function searchOpenAlexWorks(
  deps: ProviderDeps,
  args: { query: string; limit?: number },
): Promise<ExternalCandidate[]> {
  const query = args.query.trim();
  if (!query) {
    return [];
  }
  const limit = Math.min(args.limit ?? 8, 25);
  const cacheKey = normalizeKey(JSON.stringify({ query, limit }));
  const cached = deps.cache.get<ExternalCandidate[]>("openalex", cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url = new URL(OPENALEX_ENDPOINT);
    if (deps.env.openAlexApiKey) {
      url.searchParams.set("api_key", deps.env.openAlexApiKey);
    }
    url.searchParams.set("per_page", String(limit));
    url.searchParams.set("select", OPENALEX_SELECT_FIELDS.join(","));
    url.searchParams.set("filter", "is_retracted:false,is_paratext:false");
    url.searchParams.set("search", query);
    url.searchParams.set("sort", "relevance_score:desc");

    const response = await depsFetch(deps)(url, {
      headers: { Accept: "application/json", "User-Agent": researchUserAgent() },
    });
    if (!response.ok) {
      throw new Error(`OpenAlex returned ${response.status}`);
    }
    const json = (await response.json()) as { results?: OpenAlexWork[] };
    const candidates = (json.results ?? [])
      .map(openAlexWorkToCandidate)
      .filter((item): item is ExternalCandidate => Boolean(item));
    deps.cache.putCandidates("openalex", cacheKey, candidates);
    return candidates;
  } catch (error) {
    const failure = providerFailure("web", readableError(error), "openalex");
    deps.cache.putCandidates("openalex", cacheKey, failure, readableError(error));
    return failure;
  }
}
