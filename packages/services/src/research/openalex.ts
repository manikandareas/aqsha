/**
 * OpenAlex works search (multi-result) — Slice 6.4. Port of V1
 * `searchOpenAlexWorks`. Reads `OPENALEX_API_KEY` + `contactEmail()` mailto;
 * reconstructs the inverted-index abstract for a usable snippet.
 */

import { contactEmail, fetchWithTimeout } from "../papers/http";
import { normalizeDoi } from "../papers/identifiers";
import { readCachedCandidates, writeCachedCandidates } from "./cache";
import {
  collapse,
  firstNonEmpty,
  normalizeKey,
  numberOrUndefined,
  trimForSnippet,
  uniqueCompact,
} from "./text";
import { type ResearchCandidate, readableError, researchUserAgent } from "./types";

const OPENALEX_ENDPOINT = "https://api.openalex.org/works";
const PROVIDER = "openalex";

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
type OpenAlexWork = {
  id?: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  cited_by_count?: number | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: OpenAlexLocation | null;
  best_oa_location?: OpenAlexLocation | null;
  open_access?: { is_oa?: boolean | null; oa_url?: string | null } | null;
  authorships?: Array<{
    author?: { display_name?: string | null } | null;
    raw_author_name?: string | null;
  }> | null;
  primary_topic?: OpenAlexTopic | null;
  topics?: OpenAlexTopic[] | null;
  ids?: { openalex?: string | null; doi?: string | null } | null;
};

const SELECT_FIELDS = [
  "id",
  "doi",
  "title",
  "display_name",
  "publication_year",
  "publication_date",
  "cited_by_count",
  "abstract_inverted_index",
  "primary_location",
  "best_oa_location",
  "open_access",
  "authorships",
  "primary_topic",
  "topics",
  "ids",
];

export function reconstructOpenAlexAbstract(
  invertedIndex: Record<string, number[]> | null | undefined,
): string {
  if (!invertedIndex) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const position of positions) words[position] = word;
  }
  return words.filter(Boolean).join(" ").trim();
}

export async function searchOpenAlex(args: {
  query: string;
  limit?: number;
}): Promise<ResearchCandidate[]> {
  const query = args.query.trim();
  if (!query) return [];
  const limit = Math.min(args.limit ?? 5, 15);
  const cacheKey = normalizeKey(JSON.stringify({ query, limit }));
  const cached = await readCachedCandidates(PROVIDER, cacheKey);
  if (cached) return cached;

  try {
    const url = new URL(OPENALEX_ENDPOINT);
    const apiKey = process.env.OPENALEX_API_KEY;
    if (apiKey) url.searchParams.set("api_key", apiKey);
    const email = contactEmail();
    if (email) url.searchParams.set("mailto", email);
    url.searchParams.set("per_page", String(limit));
    url.searchParams.set("select", SELECT_FIELDS.join(","));
    url.searchParams.set("filter", "is_retracted:false,is_paratext:false");
    url.searchParams.set("search", query);
    url.searchParams.set("sort", "relevance_score:desc");

    const response = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": researchUserAgent() },
    });
    if (!response.ok) throw new Error(`OpenAlex returned ${response.status}`);
    const json = (await response.json()) as { results?: OpenAlexWork[] };
    const candidates = (json.results ?? [])
      .map(openAlexWorkToCandidate)
      .filter((item): item is ResearchCandidate => Boolean(item));
    await writeCachedCandidates(PROVIDER, cacheKey, candidates);
    return candidates;
  } catch (error) {
    console.error("[research] openalex search failed", readableError(error));
    await writeCachedCandidates(PROVIDER, cacheKey, [], "failed");
    return [];
  }
}

function openAlexWorkToCandidate(work: OpenAlexWork): ResearchCandidate | null {
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
  if (!title || !url) return null;

  const topics = uniqueCompact([
    work.primary_topic?.display_name,
    work.primary_topic?.subfield?.display_name,
    work.primary_topic?.field?.display_name,
    ...(work.topics ?? []).map((topic) => topic.display_name),
  ]).slice(0, 5);
  const abstract = reconstructOpenAlexAbstract(work.abstract_inverted_index);

  return {
    origin: doi ? "doi" : "web",
    provider: PROVIDER,
    evidenceStrength: abstract ? "strong" : "medium",
    title,
    locator: doi || openalexId || url,
    url,
    doi: doi || undefined,
    snippet:
      trimForSnippet(abstract, 1_200) ||
      trimForSnippet(topics.join(", "), 1_200) ||
      "Metadata OpenAlex.",
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
      topics,
      sourceLabel: location?.source?.display_name ?? "OpenAlex",
    }),
  };
}
