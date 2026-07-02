/**
 * arXiv search (Atom feed, multi-entry) — Slice 6.4. Port of V1
 * `searchArxivProvider`, reusing `fast-xml-parser` (already a `@aqsha/services`
 * dep), the Redis cache, and the in-process politeness pacer.
 */

import { XMLParser } from "fast-xml-parser";
import { normalizeDoi } from "../papers/identifiers";
import { fetchWithTimeout } from "../papers/http";
import { readCachedCandidates, writeCachedCandidates } from "./cache";
import { arxivPacer } from "./pacer";
import { asArray, collapse, normalizeKey, trimForSnippet } from "./text";
import {
  type ProviderSearchResult,
  type ResearchCandidate,
  providerError,
  providerOk,
  readableError,
  researchUserAgent,
} from "./types";

const ARXIV_ENDPOINT = "https://export.arxiv.org/api/query";
const PROVIDER = "arxiv";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

type ArxivFeedShape = { feed?: { entry?: ArxivEntry | ArxivEntry[] } };
type ArxivEntry = {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  author?: { name?: string } | Array<{ name?: string }>;
  link?: ArxivLink | ArxivLink[];
  "arxiv:doi"?: string | { "#text"?: string };
};
type ArxivLink = { "@_href"?: string; "@_rel"?: string };

export async function searchArxiv(args: {
  query: string;
  limit?: number;
}): Promise<ProviderSearchResult> {
  const query = args.query.trim();
  if (!query) return providerOk([]);
  const cacheKey = normalizeKey(`${query}:${args.limit ?? 5}`);
  const cached = await readCachedCandidates(PROVIDER, cacheKey);
  if (cached) {
    if (cached.status === "failed") {
      return providerError("arXiv sedang bermasalah (kegagalan terakhir masih dalam masa backoff).");
    }
    return providerOk(cached.candidates);
  }
  await arxivPacer.reserve();

  try {
    const url = new URL(ARXIV_ENDPOINT);
    url.searchParams.set(
      "search_query",
      query.match(/^\d{4}\.\d{4,5}/) ? `id:${query}` : `all:${query}`,
    );
    url.searchParams.set("max_results", String(Math.min(args.limit ?? 5, 8)));
    url.searchParams.set("sortBy", "relevance");
    url.searchParams.set("sortOrder", "descending");

    const response = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/atom+xml", "User-Agent": researchUserAgent() },
    });
    if (!response.ok) throw new Error(`arXiv returned ${response.status}`);
    const feed = xmlParser.parse(await response.text()) as ArxivFeedShape;
    const candidates = asArray(feed.feed?.entry)
      .map(arxivToCandidate)
      .filter((item): item is ResearchCandidate => Boolean(item));
    await writeCachedCandidates(PROVIDER, cacheKey, candidates);
    return providerOk(candidates);
  } catch (error) {
    const message = readableError(error);
    console.error("[research] arxiv search failed", message);
    await writeCachedCandidates(PROVIDER, cacheKey, [], "failed");
    return providerError(`arXiv gagal merespons (${message}).`);
  }
}

function arxivToCandidate(entry: ArxivEntry): ResearchCandidate | null {
  const title = collapse(entry.title ?? "");
  const url = preferredArxivUrl(entry);
  if (!title || !url) return null;
  const arxivId = url.split("/abs/")[1] ?? entry.id?.split("/abs/")[1];
  return {
    origin: "arxiv",
    provider: PROVIDER,
    evidenceStrength: entry.summary ? "strong" : "medium",
    title,
    locator: arxivId ?? url,
    url,
    doi: extractDoi(entry["arxiv:doi"]),
    arxivId,
    snippet: trimForSnippet(entry.summary, 1_200) || "Metadata arXiv.",
    metadataJson: JSON.stringify({
      authors: asArray(entry.author)
        .map((author) => collapse(author.name ?? ""))
        .filter(Boolean)
        .slice(0, 6),
      year: entry.published ? new Date(entry.published).getUTCFullYear() : undefined,
      publicationDate: entry.published,
      pdfUrl: arxivId ? `https://arxiv.org/pdf/${arxivId}.pdf` : undefined,
      sourceLabel: "arXiv",
    }),
  };
}

function preferredArxivUrl(entry: ArxivEntry): string | null {
  const links = asArray(entry.link);
  return (
    links.find((link) => link["@_rel"] === "alternate")?.["@_href"] ??
    links.find((link) => link["@_href"])?.["@_href"] ??
    entry.id ??
    null
  );
}

function extractDoi(value: ArxivEntry["arxiv:doi"]): string | undefined {
  const doi =
    typeof value === "string" ? normalizeDoi(value) : normalizeDoi(value?.["#text"] ?? "");
  return doi || undefined;
}
