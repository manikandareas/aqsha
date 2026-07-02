/**
 * Crossref — Slice 6.4 + Explore live search. `lookupDoi` port V1 `lookupDoiProvider`
 * (satu work per DOI). `searchCrossref` = keyword search (`/works?query=…`) untuk
 * mengisi ekor waterfall Explore saat query bukan DOI. Reads `contactEmail()` for
 * the polite-pool `mailto`.
 */

import { contactEmail, fetchWithTimeout } from "../papers/http";
import { normalizeDoi } from "../papers/identifiers";
import { readCachedCandidates, writeCachedCandidates } from "./cache";
import { collapse, normalizeKey, trimForSnippet } from "./text";
import {
  type ProviderSearchResult,
  type ResearchCandidate,
  providerError,
  providerOk,
  readableError,
  researchUserAgent,
} from "./types";

const CROSSREF_ENDPOINT = "https://api.crossref.org/works";
const PROVIDER = "crossref";

type CrossrefItem = {
  DOI?: string;
  URL?: string;
  title?: string[];
  abstract?: string;
  author?: Array<{ given?: string; family?: string }>;
  issued?: { "date-parts"?: number[][] };
  published?: { "date-parts"?: number[][] };
  "container-title"?: string[];
};

export async function lookupDoi(args: { doi: string }): Promise<ProviderSearchResult> {
  const doi = normalizeDoi(args.doi);
  if (!doi) return providerOk([]);
  const cached = await readCachedCandidates(PROVIDER, doi);
  if (cached) {
    if (cached.status === "failed") {
      return providerError("Crossref sedang bermasalah (kegagalan terakhir masih dalam masa backoff).");
    }
    return providerOk(cached.candidates);
  }

  try {
    const url = new URL(`${CROSSREF_ENDPOINT}/${encodeURIComponent(doi)}`);
    const email = contactEmail();
    if (email) url.searchParams.set("mailto", email);
    const response = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": researchUserAgent() },
    });
    if (!response.ok) throw new Error(`Crossref returned ${response.status}`);
    const json = (await response.json()) as { message?: CrossrefItem };
    const candidate = json.message ? crossrefToCandidate(json.message) : null;
    const candidates = candidate ? [candidate] : [];
    await writeCachedCandidates(PROVIDER, doi, candidates);
    return providerOk(candidates);
  } catch (error) {
    const message = readableError(error);
    console.error("[research] crossref lookup failed", message);
    await writeCachedCandidates(PROVIDER, doi, [], "failed");
    return providerError(`Crossref gagal merespons (${message}).`);
  }
}

/**
 * Keyword search Crossref (`/works?query=…&sort=relevance`, multi-hasil). Dipakai
 * waterfall Explore saat query BUKAN DOI. Best-effort + Redis-cached; error → [].
 */
export async function searchCrossref(args: {
  query: string;
  limit?: number;
}): Promise<ProviderSearchResult> {
  const query = args.query.trim();
  if (!query) return providerOk([]);
  const limit = Math.min(args.limit ?? 5, 10);
  const cacheKey = `search:${normalizeKey(JSON.stringify({ query, limit }))}`;
  const cached = await readCachedCandidates(PROVIDER, cacheKey);
  if (cached) {
    if (cached.status === "failed") {
      return providerError("Crossref sedang bermasalah (kegagalan terakhir masih dalam masa backoff).");
    }
    return providerOk(cached.candidates);
  }

  try {
    const url = new URL(CROSSREF_ENDPOINT);
    url.searchParams.set("query", query);
    url.searchParams.set("rows", String(limit));
    url.searchParams.set("sort", "relevance");
    const email = contactEmail();
    if (email) url.searchParams.set("mailto", email);
    const response = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": researchUserAgent() },
    });
    if (!response.ok) throw new Error(`Crossref returned ${response.status}`);
    const json = (await response.json()) as { message?: { items?: CrossrefItem[] } };
    const candidates = (json.message?.items ?? [])
      .map(crossrefToCandidate)
      .filter((c): c is ResearchCandidate => Boolean(c));
    await writeCachedCandidates(PROVIDER, cacheKey, candidates);
    return providerOk(candidates);
  } catch (error) {
    const message = readableError(error);
    console.error("[research] crossref search failed", message);
    await writeCachedCandidates(PROVIDER, cacheKey, [], "failed");
    return providerError(`Crossref gagal merespons (${message}).`);
  }
}

function crossrefToCandidate(item: CrossrefItem): ResearchCandidate | null {
  const doi = normalizeDoi(item.DOI ?? "");
  const title = item.title?.find((value) => value.trim())?.trim();
  if (!doi || !title) return null;
  return {
    origin: "doi",
    provider: PROVIDER,
    evidenceStrength: item.abstract ? "medium" : "weak",
    title: collapse(title),
    locator: doi,
    url: item.URL || `https://doi.org/${doi}`,
    doi,
    snippet:
      trimForSnippet(stripTags(item.abstract), 1_200) ||
      trimForSnippet(item["container-title"]?.[0], 1_200) ||
      "Metadata Crossref (tanpa abstrak).",
    metadataJson: JSON.stringify({
      authors: (item.author ?? [])
        .map((author) => collapse([author.given, author.family].filter(Boolean).join(" ")))
        .filter(Boolean)
        .slice(0, 6),
      year: item.published?.["date-parts"]?.[0]?.[0] ?? item.issued?.["date-parts"]?.[0]?.[0],
      venue: item["container-title"]?.find((value) => value.trim()),
      sourceLabel: item["container-title"]?.find((value) => value.trim()) ?? "Crossref",
    }),
  };
}

function stripTags(value: string | undefined): string | undefined {
  return value?.replace(/<[^>]+>/g, " ");
}
