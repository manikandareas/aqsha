/**
 * External metadata-provider fetchers for the paper-resolution stack. Ported
 * faithfully from V1 `papers/ingest/providers.ts` (endpoints, response parsing,
 * OA pdf-candidate extraction, env var names all preserved).
 *
 * Two deliberate simplifications vs V1:
 *  - The Convex `globalThrottle(ctx, name)` per-provider pacing is dropped. The
 *    Redis lookup cache (external-cache.ts) absorbs repeats, which is the only
 *    rate control here. See the TODO(P3+) markers below.
 *  - `fast-xml-parser` (a Convex dep, not installed here) is replaced by a
 *    small Atom-feed reader tuned to arXiv's single-entry `id_list` response.
 */

import { contactEmail, fetchWithTimeout, userAgent } from "./http";
import { arxivAbsUrl, arxivPdfUrl, normalizeDoi } from "./identifiers";
import type { ArxivPartial, PartialPaper } from "./model";

const OPENALEX_ENDPOINT = "https://api.openalex.org/works";
const CROSSREF_ENDPOINT = "https://api.crossref.org/works";
const ARXIV_ENDPOINT = "https://export.arxiv.org/api/query";
const UNPAYWALL_ENDPOINT = "https://api.unpaywall.org/v2";
const S2_ENDPOINT = "https://api.semanticscholar.org/graph/v1/paper";

// ── small pure helpers (inlined from V1 lib/text.ts + lib/arrays.ts) ─────────

/** Collapse internal whitespace runs to single spaces and trim the ends. */
function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Return the number only when it is finite, otherwise `undefined`. */
function numberOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Normalise a possibly-single, possibly-nullish value into an array. */
function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function compact(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value && value.trim()));
}

function yearFromIso(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})/);
  return match ? Number(match[1]) : undefined;
}

// ── OpenAlex ─────────────────────────────────────────────────────────────────

type OpenAlexLocation = {
  landing_page_url?: string | null;
  pdf_url?: string | null;
  is_oa?: boolean | null;
  source?: {
    display_name?: string | null;
    host_organization_name?: string | null;
  } | null;
};

type OpenAlexWork = {
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: OpenAlexLocation | null;
  best_oa_location?: OpenAlexLocation | null;
  locations?: OpenAlexLocation[] | null;
  open_access?: {
    is_oa?: boolean | null;
    oa_status?: string | null;
    oa_url?: string | null;
  } | null;
  authorships?: Array<{
    author?: { display_name?: string | null } | null;
    raw_author_name?: string | null;
    institutions?: Array<{ display_name?: string | null }> | null;
  }> | null;
};

/** Rebuild a readable abstract from OpenAlex's inverted-index representation. */
export function reconstructOpenAlexAbstract(
  invertedIndex: Record<string, number[]> | null | undefined,
): string {
  if (!invertedIndex) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const position of positions) {
      words[position] = word;
    }
  }
  return words.filter(Boolean).join(" ").trim();
}

function openAlexWorkToPartial(work: OpenAlexWork): PartialPaper {
  const location = work.best_oa_location ?? work.primary_location ?? null;
  return {
    doi: work.doi ? normalizeDoi(work.doi) : undefined,
    title: collapse(work.display_name ?? work.title ?? "") || undefined,
    abstract: reconstructOpenAlexAbstract(work.abstract_inverted_index) || undefined,
    authors: (work.authorships ?? [])
      .map((a) => ({
        name: collapse(a.author?.display_name ?? a.raw_author_name ?? ""),
        affiliation: a.institutions?.[0]?.display_name ?? undefined,
      }))
      .filter((a) => a.name),
    journal: collapse(location?.source?.display_name ?? "") || undefined,
    publisher: collapse(location?.source?.host_organization_name ?? "") || undefined,
    publishedYear: numberOrUndefined(work.publication_year),
    metadataSource: "openalex",
    oaStatus: work.open_access?.oa_status ?? undefined,
    pdfCandidates: compact([
      work.best_oa_location?.pdf_url,
      work.open_access?.oa_url,
      ...(work.locations ?? []).map((loc) => loc.pdf_url),
    ]),
    landingPageUrl: location?.landing_page_url ?? undefined,
  };
}

export async function openAlexByDoi(doi: string): Promise<PartialPaper | null> {
  // TODO(P3+): provider pacing via rate-limiter-flexible (was globalThrottle).
  try {
    const url = new URL(`${OPENALEX_ENDPOINT}/doi:${encodeURIComponent(doi)}`);
    const email = contactEmail();
    if (email) url.searchParams.set("mailto", email);
    const apiKey = process.env.OPENALEX_API_KEY;
    if (apiKey) url.searchParams.set("api_key", apiKey);
    const res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": userAgent() },
    });
    if (!res.ok) return null;
    return openAlexWorkToPartial((await res.json()) as OpenAlexWork);
  } catch {
    return null;
  }
}

export async function openAlexByPmid(pmid: string): Promise<PartialPaper | null> {
  // TODO(P3+): provider pacing via rate-limiter-flexible (was globalThrottle).
  try {
    const url = new URL(`${OPENALEX_ENDPOINT}/pmid:${encodeURIComponent(pmid)}`);
    const email = contactEmail();
    if (email) url.searchParams.set("mailto", email);
    const res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": userAgent() },
    });
    if (!res.ok) return null;
    return openAlexWorkToPartial((await res.json()) as OpenAlexWork);
  } catch {
    return null;
  }
}

// ── Crossref ─────────────────────────────────────────────────────────────────

type CrossrefWork = {
  message?: {
    DOI?: string;
    title?: string[];
    author?: Array<{
      given?: string;
      family?: string;
      name?: string;
      affiliation?: Array<{ name?: string }>;
    }>;
    "container-title"?: string[];
    publisher?: string;
    issued?: { "date-parts"?: number[][] };
    published?: { "date-parts"?: number[][] };
  };
};

export async function crossrefByDoi(doi: string): Promise<PartialPaper | null> {
  // TODO(P3+): provider pacing via rate-limiter-flexible (was globalThrottle).
  try {
    const url = new URL(`${CROSSREF_ENDPOINT}/${encodeURIComponent(doi)}`);
    const email = contactEmail();
    if (email) url.searchParams.set("mailto", email);
    const res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": userAgent() },
    });
    if (!res.ok) return null;
    const m = ((await res.json()) as CrossrefWork).message;
    if (!m) return null;
    const year =
      m.issued?.["date-parts"]?.[0]?.[0] ?? m.published?.["date-parts"]?.[0]?.[0];
    return {
      doi: m.DOI ? normalizeDoi(m.DOI) : doi,
      title: collapse(m.title?.[0] ?? "") || undefined,
      authors: (m.author ?? [])
        .map((a) => ({
          name: collapse(a.name ?? `${a.given ?? ""} ${a.family ?? ""}`),
          affiliation: a.affiliation?.[0]?.name,
        }))
        .filter((a) => a.name),
      journal: collapse(m["container-title"]?.[0] ?? "") || undefined,
      publisher: collapse(m.publisher ?? "") || undefined,
      publishedYear: numberOrUndefined(year),
      metadataSource: "crossref",
    };
  } catch {
    return null;
  }
}

// ── arXiv (Atom) ─────────────────────────────────────────────────────────────

type ArxivEntry = {
  title?: string;
  summary?: string;
  published?: string;
  doi?: string;
  journal_ref?: string;
  authors: string[];
};

// Lightweight Atom reader tuned to arXiv's single-entry `id_list` response.
// Replaces V1's fast-xml-parser (a Convex-only dependency). We only extract the
// fields the resolver actually reads.
function firstTagText(scope: string, tag: string): string | undefined {
  // Match <tag ...>...</tag> non-greedily; tolerate namespace prefixes.
  const re = new RegExp(
    `<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`,
    "i",
  );
  const match = scope.match(re);
  return match ? decodeXmlEntities(match[1]) : undefined;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseArxivAtom(xml: string): ArxivEntry | null {
  const entryMatch = xml.match(
    /<(?:[\w-]+:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?entry>/i,
  );
  if (!entryMatch) return null;
  const entry = entryMatch[1];

  const authors: string[] = [];
  const authorRe =
    /<(?:[\w-]+:)?author(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?author>/gi;
  for (const authorMatch of entry.matchAll(authorRe)) {
    const name = firstTagText(authorMatch[1], "name");
    if (name) authors.push(name);
  }

  return {
    title: firstTagText(entry, "title"),
    summary: firstTagText(entry, "summary"),
    published: firstTagText(entry, "published"),
    doi: firstTagText(entry, "doi"),
    journal_ref: firstTagText(entry, "journal_ref"),
    authors,
  };
}

export async function arxivById(arxivId: string): Promise<ArxivPartial | null> {
  // TODO(P3+): provider pacing via rate-limiter-flexible (was globalThrottle).
  try {
    const url = new URL(ARXIV_ENDPOINT);
    url.searchParams.set("id_list", arxivId);
    url.searchParams.set("max_results", "1");
    const res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/atom+xml", "User-Agent": userAgent() },
      timeoutMs: 20_000,
    });
    if (!res.ok) return null;
    const entry = parseArxivAtom(await res.text());
    if (!entry) return null;
    return {
      arxivId,
      title: collapse(entry.title ?? "") || undefined,
      abstract: collapse(entry.summary ?? "") || undefined,
      authors: entry.authors
        .map((name) => ({ name: collapse(name) }))
        .filter((a) => a.name),
      publishedYear: yearFromIso(entry.published),
      publishedDoi: entry.doi ? normalizeDoi(entry.doi) : undefined,
      journal: collapse(entry.journal_ref ?? "") || undefined,
      metadataSource: "arxiv",
      pdfCandidates: [arxivPdfUrl(arxivId)],
      landingPageUrl: arxivAbsUrl(arxivId),
    };
  } catch {
    return null;
  }
}

// ── Unpaywall ────────────────────────────────────────────────────────────────

export async function unpaywallByDoi(
  doi: string,
): Promise<{ pdfUrl?: string; oaStatus?: string } | null> {
  const email = process.env.UNPAYWALL_EMAIL || contactEmail();
  if (!email) return null;
  // TODO(P3+): provider pacing via rate-limiter-flexible (was globalThrottle).
  try {
    const url = new URL(`${UNPAYWALL_ENDPOINT}/${encodeURIComponent(doi)}`);
    url.searchParams.set("email", email);
    const res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": userAgent() },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      oa_status?: string;
      best_oa_location?: { url_for_pdf?: string | null } | null;
      oa_locations?: Array<{ url_for_pdf?: string | null }> | null;
    };
    const pdfUrl =
      json.best_oa_location?.url_for_pdf ??
      json.oa_locations?.find((location) => location.url_for_pdf)?.url_for_pdf ??
      undefined;
    return { pdfUrl: pdfUrl ?? undefined, oaStatus: json.oa_status };
  } catch {
    return null;
  }
}

// ── Semantic Scholar ─────────────────────────────────────────────────────────

export async function semanticScholar(id: {
  doi?: string;
  arxivId?: string;
}): Promise<{ abstract?: string; pdfUrl?: string } | null> {
  const paperId = id.doi ? `DOI:${id.doi}` : id.arxivId ? `ARXIV:${id.arxivId}` : null;
  if (!paperId) return null;
  // TODO(P3+): provider pacing via rate-limiter-flexible (was globalThrottle).
  try {
    const url = new URL(`${S2_ENDPOINT}/${encodeURIComponent(paperId)}`);
    url.searchParams.set("fields", "abstract,externalIds,openAccessPdf");
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": userAgent(),
    };
    const key = process.env.SEMANTIC_SCHOLAR_API_KEY;
    if (key) headers["x-api-key"] = key;
    const res = await fetchWithTimeout(url.toString(), { headers });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      abstract?: string | null;
      openAccessPdf?: { url?: string | null } | null;
    };
    return {
      abstract: json.abstract ?? undefined,
      pdfUrl: json.openAccessPdf?.url ?? undefined,
    };
  } catch {
    return null;
  }
}

// ── DataCite ─────────────────────────────────────────────────────────────────

type DataCiteResponse = {
  data?: {
    attributes?: {
      titles?: Array<{ title?: string }>;
      creators?: Array<{
        name?: string;
        givenName?: string;
        familyName?: string;
      }>;
      publicationYear?: number;
      publisher?: string;
      descriptions?: Array<{ description?: string; descriptionType?: string }>;
    };
  };
};

export async function dataCiteByDoi(doi: string): Promise<PartialPaper | null> {
  try {
    const res = await fetchWithTimeout(
      `https://api.datacite.org/dois/${encodeURIComponent(doi)}`,
      {
        headers: { Accept: "application/json", "User-Agent": userAgent() },
        timeoutMs: 15_000,
      },
    );
    if (!res.ok) return null;
    const attr = ((await res.json()) as DataCiteResponse).data?.attributes;
    if (!attr) return null;
    const abstract = attr.descriptions?.find(
      (d) => (d.descriptionType ?? "").toLowerCase() === "abstract",
    )?.description;
    return {
      title: collapse(attr.titles?.[0]?.title ?? "") || undefined,
      abstract: collapse(abstract ?? "") || undefined,
      authors: (attr.creators ?? [])
        .map((c) => ({
          name: collapse(c.name ?? `${c.givenName ?? ""} ${c.familyName ?? ""}`),
        }))
        .filter((a) => a.name),
      publisher: collapse(attr.publisher ?? "") || undefined,
      publishedYear: numberOrUndefined(attr.publicationYear),
      metadataSource: "datacite",
    };
  } catch {
    return null;
  }
}
