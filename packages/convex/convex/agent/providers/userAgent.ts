// Single source of truth for the User-Agent Aqsha sends on scholarly provider
// calls (arXiv / Crossref / OpenAlex etiquette). One definition so every provider
// identifies itself identically; `CROSSREF_MAILTO` appends the optional contact
// these APIs ask politely for. NOTE: this is intentionally distinct from the
// paper-ingest `userAgent()` in papers/ingest/http.ts, which uses a different
// product identity for Unpaywall/Semantic Scholar.
export const RESEARCH_USER_AGENT =
  "AqshaResearch/phase3 (https://aqsha.local; mailto optional)";

export function researchUserAgent(): string {
  const mailto = process.env.CROSSREF_MAILTO;
  return mailto
    ? `${RESEARCH_USER_AGENT}; mailto:${mailto}`
    : RESEARCH_USER_AGENT;
}
