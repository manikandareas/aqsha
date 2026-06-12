// Scholarly-identifier helpers (port of packages/convex/convex/lib/identifiers.ts
// plus the arXiv-id normalizer from agent/research/sourceQuality.ts).

/**
 * Canonical DOI normalizer (loose): strips a `https?://(dx.)?doi.org/` prefix
 * AND a leading `doi:` prefix, then lowercases. Trims surrounding whitespace.
 */
export function normalizeDoi(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "")
    .toLowerCase();
}

/**
 * Normalize an arXiv id: strips url/prefix forms ("arXiv:2403.01234v2",
 * "https://arxiv.org/abs/2403.01234") down to "2403.01234" (version dropped).
 * Returns null when no plausible id is present.
 */
export function normalizeArxivId(value: string): string | null {
  const cleaned = value
    .trim()
    .replace(/^https?:\/\/arxiv\.org\/(abs|pdf)\//i, "")
    .replace(/^arxiv:/i, "")
    .replace(/\.pdf$/i, "");
  const match = cleaned.match(/\d{4}\.\d{4,5}/);
  return match ? match[0] : null;
}
