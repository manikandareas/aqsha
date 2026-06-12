import { XMLParser } from "fast-xml-parser";
import { normalizeDoi } from "../lib/identifiers";
import { asArray, collapse, normalizeKey, trimForSnippet } from "../lib/text";
import {
  depsFetch,
  providerFailure,
  readableError,
  researchUserAgent,
  type ExternalCandidate,
  type ProviderDeps,
} from "./types";

const ARXIV_ENDPOINT = "https://export.arxiv.org/api/query";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

type ArxivFeedShape = { feed?: { entry?: ArxivEntry | ArxivEntry[] } };
export type ArxivEntry = {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  updated?: string;
  author?: { name?: string } | Array<{ name?: string }>;
  link?: ArxivLink | ArxivLink[];
  "arxiv:doi"?: string | { "#text"?: string };
};
type ArxivLink = { "@_href"?: string; "@_rel"?: string; "@_title"?: string };

export function arxivToCandidate(entry: ArxivEntry): ExternalCandidate | null {
  const title = collapse(entry.title ?? "");
  const url = preferredArxivUrl(entry);
  if (!title || !url) {
    return null;
  }
  const arxivId = url.split("/abs/")[1] ?? entry.id?.split("/abs/")[1];
  return {
    origin: "arxiv",
    evidenceStrength: entry.summary ? "strong" : "medium",
    title,
    locator: arxivId ?? url,
    url,
    doi: extractDoi(entry["arxiv:doi"]),
    arxivId,
    snippet: trimForSnippet(entry.summary) || "arXiv metadata result.",
    metadataJson: JSON.stringify({
      authors: asArray(entry.author)
        .map((author) => collapse(author.name ?? ""))
        .filter(Boolean)
        .slice(0, 6),
      year: entry.published ? new Date(entry.published).getUTCFullYear() : undefined,
      publicationDate: entry.published,
      pdfUrl: arxivId ? `https://arxiv.org/pdf/${arxivId}.pdf` : undefined,
      topics: ["Preprint"],
      sourceLabel: "arXiv",
    }),
  };
}

export async function searchArxivProvider(
  deps: ProviderDeps,
  args: { query: string; limit?: number },
): Promise<ExternalCandidate[]> {
  const query = args.query.trim();
  if (!query) {
    return [];
  }
  const cacheKey = normalizeKey(`${query}:${args.limit ?? 5}`);
  const cached = deps.cache.get<ExternalCandidate[]>("arxiv", cacheKey);
  if (cached) {
    return cached;
  }
  // Politeness pacing only — billing/per-user limits stay in Convex (plan §3).
  await deps.paceArxiv?.();

  try {
    const url = new URL(ARXIV_ENDPOINT);
    url.searchParams.set(
      "search_query",
      query.match(/^\d{4}\.\d{4,5}/) ? `id:${query}` : `all:${query}`,
    );
    url.searchParams.set("max_results", String(Math.min(args.limit ?? 5, 8)));
    url.searchParams.set("sortBy", "relevance");
    url.searchParams.set("sortOrder", "descending");

    const response = await depsFetch(deps)(url, {
      headers: {
        Accept: "application/atom+xml",
        "User-Agent": researchUserAgent(),
      },
    });
    if (!response.ok) {
      throw new Error(`arXiv returned ${response.status}`);
    }
    const feed = xmlParser.parse(await response.text()) as ArxivFeedShape;
    const candidates = asArray(feed.feed?.entry)
      .map(arxivToCandidate)
      .filter((item): item is ExternalCandidate => Boolean(item));
    deps.cache.putCandidates("arxiv", cacheKey, candidates);
    return candidates;
  } catch (error) {
    const failure = providerFailure("arxiv", readableError(error));
    deps.cache.putCandidates("arxiv", cacheKey, failure, readableError(error));
    return failure;
  }
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
