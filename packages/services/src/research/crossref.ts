/**
 * Crossref DOI lookup — Slice 6.4. Port of V1 `lookupDoiProvider`. A DOI is not a
 * search query, so this returns at most one candidate (the work for that DOI).
 * Reads `contactEmail()` for the polite-pool `mailto`.
 */

import { contactEmail, fetchWithTimeout } from "../papers/http";
import { normalizeDoi } from "../papers/identifiers";
import { readCachedCandidates, writeCachedCandidates } from "./cache";
import { collapse, trimForSnippet } from "./text";
import { type ResearchCandidate, readableError, researchUserAgent } from "./types";

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

export async function lookupDoi(args: { doi: string }): Promise<ResearchCandidate[]> {
  const doi = normalizeDoi(args.doi);
  if (!doi) return [];
  const cached = await readCachedCandidates(PROVIDER, doi);
  if (cached) return cached;

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
    return candidates;
  } catch (error) {
    console.error("[research] crossref lookup failed", readableError(error));
    await writeCachedCandidates(PROVIDER, doi, [], "failed");
    return [];
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
