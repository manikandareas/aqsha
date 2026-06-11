/**
 * Canonical scholarly-identifier helpers shared across providers, extraction,
 * feed, and explore modules. Side-effect free so they can be unit tested.
 */

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
