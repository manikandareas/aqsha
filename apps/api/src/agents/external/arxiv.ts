// arXiv query API client. Uses Atom XML feed:
//   https://export.arxiv.org/api/query?search_query=...&max_results=N&sortBy=...
//
// Docs: https://info.arxiv.org/help/api/user-manual.html
//
// No API key required. Polite UA + 15s timeout enforced via shared http helper.

import { XMLParser } from "fast-xml-parser";
import { bytesToText, politelyFetch } from "./http";
import type { CandidateSource } from "./types";

export type ArxivSortBy = "relevance" | "lastUpdatedDate" | "submittedDate";
export type ArxivSortOrder = "ascending" | "descending";

export type ArxivSearchOptions = {
  maxResults?: number;
  sortBy?: ArxivSortBy;
  sortOrder?: ArxivSortOrder;
  signal?: AbortSignal;
};

const ARXIV_ENDPOINT = "https://export.arxiv.org/api/query";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

export async function searchArxiv(
  query: string,
  options: ArxivSearchOptions = {},
): Promise<CandidateSource[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const url = new URL(ARXIV_ENDPOINT);
  url.searchParams.set("search_query", `all:${trimmed}`);
  url.searchParams.set("max_results", String(options.maxResults ?? 10));
  url.searchParams.set("sortBy", options.sortBy ?? "relevance");
  url.searchParams.set("sortOrder", options.sortOrder ?? "descending");

  const result = await politelyFetch(url.toString(), {
    signal: options.signal,
    accept: "application/atom+xml",
  });

  const xml = bytesToText(result.bytes);
  const feed = xmlParser.parse(xml) as ArxivFeedShape;

  const entries = normalizeArray(feed?.feed?.entry);
  return entries.map(toCandidate).filter((c): c is CandidateSource => Boolean(c));
}

// ───────────────────────── parsing ─────────────────────────

type ArxivFeedShape = {
  feed?: {
    entry?: ArxivEntry | ArxivEntry[];
  };
};

type ArxivEntry = {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  updated?: string;
  author?: ArxivAuthor | ArxivAuthor[];
  link?: ArxivLink | ArxivLink[];
  "arxiv:doi"?: string | { "#text"?: string };
  "arxiv:primary_category"?: { "@_term"?: string };
};

type ArxivAuthor = { name?: string };
type ArxivLink = {
  "@_href"?: string;
  "@_rel"?: string;
  "@_title"?: string;
  "@_type"?: string;
};

function normalizeArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function toCandidate(entry: ArxivEntry): CandidateSource | null {
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  const url = preferredUrl(entry, id);
  if (!url) {
    return null;
  }

  const title = cleanText(entry.title);
  if (!title) {
    return null;
  }

  return {
    url,
    title,
    snippet: cleanText(entry.summary),
    publishedDate: cleanText(entry.published) ?? cleanText(entry.updated),
    authors: normalizeArray(entry.author)
      .map((a) => cleanText(a?.name))
      .filter((name): name is string => Boolean(name)),
    doi: extractDoi(entry["arxiv:doi"]),
    provider: "arxiv",
    raw: { arxivId: id, primaryCategory: entry["arxiv:primary_category"]?.["@_term"] ?? null },
  };
}

function preferredUrl(entry: ArxivEntry, fallback: string): string | null {
  const links = normalizeArray(entry.link);
  // Prefer the abstract page (rel=alternate) over the PDF (title=pdf).
  const alternate = links.find((link) => link["@_rel"] === "alternate" && link["@_href"]);
  if (alternate?.["@_href"]) {
    return alternate["@_href"];
  }
  const anyHref = links.find((link) => link["@_href"]);
  if (anyHref?.["@_href"]) {
    return anyHref["@_href"];
  }
  return fallback || null;
}

function extractDoi(value: ArxivEntry["arxiv:doi"]): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (value && typeof value === "object") {
    const text = value["#text"];
    return typeof text === "string" && text.trim() ? text.trim() : null;
  }
  return null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed || null;
}
