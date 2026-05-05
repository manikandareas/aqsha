// CrossRef REST client. Endpoint:
//   https://api.crossref.org/works?query=...&rows=N&filter=...
//
// Docs: https://api.crossref.org/swagger-ui/index.html
//
// "Polite pool" rule: include `mailto=` so they prioritise our requests over
// anonymous traffic. We pass it as a query param (their preferred form).

import { env } from "../../config";
import { fetchJson } from "./http";
import type { CandidateSource } from "./types";

export type CrossrefSearchOptions = {
  rows?: number;
  /** ISO date `YYYY-MM-DD`. Filters works published on or after. */
  fromDate?: string;
  /** ISO date `YYYY-MM-DD`. Filters works published on or before. */
  untilDate?: string;
  /** CrossRef work type, e.g. `journal-article`, `book-chapter`, `proceedings-article`. */
  type?: string;
  signal?: AbortSignal;
};

const CROSSREF_ENDPOINT = "https://api.crossref.org/works";

export async function searchCrossref(
  query: string,
  options: CrossrefSearchOptions = {},
): Promise<CandidateSource[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const url = new URL(CROSSREF_ENDPOINT);
  url.searchParams.set("query", trimmed);
  url.searchParams.set("rows", String(options.rows ?? 10));

  const filters: string[] = [];
  if (options.fromDate) {
    filters.push(`from-pub-date:${options.fromDate}`);
  }
  if (options.untilDate) {
    filters.push(`until-pub-date:${options.untilDate}`);
  }
  if (options.type) {
    filters.push(`type:${options.type}`);
  }
  if (filters.length > 0) {
    url.searchParams.set("filter", filters.join(","));
  }

  const mailto = env.ASTRA_CROSSREF_MAILTO;
  if (mailto) {
    url.searchParams.set("mailto", mailto);
  }

  const { json } = await fetchJson<CrossrefResponse>(url.toString(), {
    signal: options.signal,
  });

  const items = json?.message?.items ?? [];
  return items.map(toCandidate).filter((c): c is CandidateSource => Boolean(c));
}

// ───────────────────────── parsing ─────────────────────────

type CrossrefResponse = {
  message?: {
    items?: CrossrefItem[];
  };
};

type CrossrefItem = {
  DOI?: string;
  URL?: string;
  title?: string[];
  abstract?: string;
  author?: Array<{ given?: string; family?: string }>;
  type?: string;
  issued?: { "date-parts"?: number[][] };
  published?: { "date-parts"?: number[][] };
  "container-title"?: string[];
};

function toCandidate(item: CrossrefItem): CandidateSource | null {
  const doi = typeof item.DOI === "string" ? item.DOI.trim() : "";
  const url = doi
    ? `https://doi.org/${doi}`
    : (typeof item.URL === "string" && item.URL.trim() ? item.URL.trim() : null);
  if (!url) {
    return null;
  }

  const title = (Array.isArray(item.title) ? item.title.find((t) => typeof t === "string" && t.trim()) : null);
  if (!title) {
    return null;
  }

  return {
    url,
    title: collapseWhitespace(title),
    snippet: cleanAbstract(item.abstract),
    publishedDate: extractIsoDate(item.published) ?? extractIsoDate(item.issued),
    authors: (item.author ?? [])
      .map((a) => formatAuthor(a))
      .filter((name): name is string => Boolean(name)),
    doi: doi || null,
    provider: "crossref",
    raw: {
      type: item.type ?? null,
      containerTitle: item["container-title"]?.[0] ?? null,
    },
  };
}

function formatAuthor(author: { given?: string; family?: string }): string | null {
  const given = typeof author.given === "string" ? author.given.trim() : "";
  const family = typeof author.family === "string" ? author.family.trim() : "";
  const combined = `${given} ${family}`.trim();
  return combined || null;
}

function extractIsoDate(field?: { "date-parts"?: number[][] }): string | null {
  const parts = field?.["date-parts"]?.[0];
  if (!parts || parts.length === 0) {
    return null;
  }
  const [year, month, day] = parts;
  if (typeof year !== "number") {
    return null;
  }
  const yyyy = String(year).padStart(4, "0");
  if (typeof month !== "number") {
    return yyyy;
  }
  const mm = String(month).padStart(2, "0");
  if (typeof day !== "number") {
    return `${yyyy}-${mm}`;
  }
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function cleanAbstract(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  // CrossRef abstracts often contain JATS XML tags. Strip them.
  const stripped = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return stripped || null;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
