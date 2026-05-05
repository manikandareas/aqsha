// PubMed (NCBI E-utilities) client. Two-step lookup:
//   1. esearch.fcgi?db=pubmed&term=...&retmode=json  → list of PMIDs
//   2. esummary.fcgi?db=pubmed&id=<csv>&retmode=json → metadata
//
// Docs: https://www.ncbi.nlm.nih.gov/books/NBK25497/
//
// API key (`api_key=`) is optional: presence raises rate limit from 3 → 10 req/s.

import { env } from "../../config";
import { fetchJson } from "./http";
import type { CandidateSource } from "./types";

export type PubmedSearchOptions = {
  retmax?: number;
  /** Date range filter, ISO `YYYY-MM-DD`. Both bounds inclusive. */
  fromDate?: string;
  untilDate?: string;
  /** Publication type, e.g. `Clinical Trial`, `Review`, `Randomized Controlled Trial`. */
  pubType?: string;
  signal?: AbortSignal;
};

const ESEARCH_ENDPOINT = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const ESUMMARY_ENDPOINT = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";

export async function searchPubmed(
  query: string,
  options: PubmedSearchOptions = {},
): Promise<CandidateSource[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const term = buildTermExpression(trimmed, options);

  const searchUrl = new URL(ESEARCH_ENDPOINT);
  searchUrl.searchParams.set("db", "pubmed");
  searchUrl.searchParams.set("term", term);
  searchUrl.searchParams.set("retmode", "json");
  searchUrl.searchParams.set("retmax", String(options.retmax ?? 10));
  applyApiKey(searchUrl);

  const search = await fetchJson<EsearchResponse>(searchUrl.toString(), {
    signal: options.signal,
  });

  const ids = search.json?.esearchresult?.idlist ?? [];
  if (ids.length === 0) {
    return [];
  }

  const summaryUrl = new URL(ESUMMARY_ENDPOINT);
  summaryUrl.searchParams.set("db", "pubmed");
  summaryUrl.searchParams.set("id", ids.join(","));
  summaryUrl.searchParams.set("retmode", "json");
  applyApiKey(summaryUrl);

  const summary = await fetchJson<EsummaryResponse>(summaryUrl.toString(), {
    signal: options.signal,
  });

  const map = summary.json?.result ?? {};
  return ids
    .map((id) => map[id])
    .filter((doc): doc is EsummaryDoc => Boolean(doc) && typeof doc === "object")
    .map(toCandidate)
    .filter((c): c is CandidateSource => Boolean(c));
}

// ───────────────────────── helpers ─────────────────────────

function applyApiKey(url: URL) {
  if (env.ASTRA_PUBMED_API_KEY) {
    url.searchParams.set("api_key", env.ASTRA_PUBMED_API_KEY);
  }
}

function buildTermExpression(query: string, options: PubmedSearchOptions): string {
  const clauses: string[] = [query];
  if (options.fromDate || options.untilDate) {
    const from = options.fromDate ?? "1900-01-01";
    const until = options.untilDate ?? new Date().toISOString().slice(0, 10);
    clauses.push(`("${from}"[Date - Publication] : "${until}"[Date - Publication])`);
  }
  if (options.pubType) {
    clauses.push(`"${options.pubType}"[Publication Type]`);
  }
  return clauses.join(" AND ");
}

// ───────────────────────── parsing ─────────────────────────

type EsearchResponse = {
  esearchresult?: {
    idlist?: string[];
  };
};

type EsummaryResponse = {
  result?: Record<string, EsummaryDoc>;
};

type EsummaryDoc = {
  uid?: string;
  title?: string;
  authors?: Array<{ name?: string }>;
  pubdate?: string;
  source?: string;
  fulljournalname?: string;
  articleids?: Array<{ idtype?: string; value?: string }>;
};

function toCandidate(doc: EsummaryDoc): CandidateSource | null {
  const pmid = typeof doc.uid === "string" ? doc.uid.trim() : "";
  if (!pmid) {
    return null;
  }
  const title = typeof doc.title === "string" ? doc.title.replace(/\s+/g, " ").trim() : "";
  if (!title) {
    return null;
  }

  const doi = extractDoi(doc.articleids);

  return {
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    title,
    snippet: null,
    publishedDate: typeof doc.pubdate === "string" && doc.pubdate.trim() ? doc.pubdate.trim() : null,
    authors: (doc.authors ?? [])
      .map((a) => (typeof a.name === "string" ? a.name.trim() : null))
      .filter((name): name is string => Boolean(name)),
    doi,
    provider: "pubmed",
    raw: {
      pmid,
      journal: doc.fulljournalname ?? doc.source ?? null,
    },
  };
}

function extractDoi(ids?: Array<{ idtype?: string; value?: string }>): string | null {
  if (!Array.isArray(ids)) {
    return null;
  }
  const doi = ids.find((id) => id?.idtype === "doi" && typeof id.value === "string" && id.value.trim());
  return doi?.value?.trim() ?? null;
}
