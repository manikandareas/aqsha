/**
 * Pure helpers (no I/O) for the uploaded-PDF metadata enrichment path. Kept
 * side-effect free so they can be unit tested and shared between the Node-
 * runtime upload pipeline and the isolate-runtime enrichment action.
 */

import type { ClassifiedUrl } from "./identifiers";
import { extractArxivId, extractDoi } from "./identifiers";

// Heading that marks the end of a paper's front matter and the start of its
// bibliography. Identifiers after this point belong to CITED works, not this
// paper, so we never resolve from there.
const REFERENCES_HEADING_RE =
  /\n\s*(references|bibliography|works\s+cited|literature\s+cited)\s*\n/i;

// Hard cap on the header window even when no References heading is found, so a
// DOI buried deep in the body (typically a citation) can't be mistaken for the
// paper's own identifier. The paper's DOI is printed in the front matter.
const MAX_HEADER_CHARS = 3000;

/**
 * The front-matter slice of a paper where its own DOI/arXiv id is printed:
 * everything before the References/Bibliography heading, capped at
 * {@link MAX_HEADER_CHARS}. Pure so it can be unit tested.
 */
export function paperHeaderRegion(text: string): string {
  const refIndex = text.search(REFERENCES_HEADING_RE);
  const cut = refIndex >= 0 ? Math.min(refIndex, MAX_HEADER_CHARS) : MAX_HEADER_CHARS;
  return text.slice(0, cut);
}

/**
 * Build a clean academic {@link ClassifiedUrl} from arbitrary document text
 * (e.g. the first pages of an uploaded PDF). Mirrors `classifyUrl`'s
 * arXiv-before-DOI precedence, but sets `raw` to the bare identifier rather
 * than the whole text blob so the resolver's provider cache key stays small.
 *
 * Only the paper's header region is searched (see {@link paperHeaderRegion}) so
 * a DOI/arXiv id from the References section can't resolve a CITED paper's
 * metadata instead of this one's. Returns `null` when no academic identifier is
 * present in the header.
 */
export function classifyPaperText(text: string): ClassifiedUrl | null {
  const header = paperHeaderRegion(text);
  const arxivId = extractArxivId(header);
  if (arxivId) {
    return { kind: "arxiv", arxivId, academicDomain: false, raw: arxivId };
  }
  const doi = extractDoi(header);
  if (doi) {
    return { kind: "doi", doi, academicDomain: false, raw: doi };
  }
  return null;
}

/**
 * Whether resolved/extracted metadata carries enough signal to be worth
 * surfacing. We require at least a title, an abstract, or one author — a bare
 * DOI with no descriptive fields is not useful on its own.
 */
export function isUsablePaperMetadata(meta: {
  title?: string;
  abstract?: string;
  authorCount: number;
}): boolean {
  return Boolean(
    (meta.title && meta.title.trim()) ||
      (meta.abstract && meta.abstract.trim()) ||
      meta.authorCount > 0,
  );
}

export type NormalizedLlmPaperMetadata = {
  title?: string;
  abstract?: string;
  doi?: string;
  authors: string[];
  journal?: string;
  publishedYear?: number;
};

const MIN_PUBLICATION_YEAR = 1500;
const MAX_PUBLICATION_YEAR = 2100;

function cleanString(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

/**
 * Normalize raw LLM-extracted bibliographic fields: trim/collapse whitespace,
 * drop empties, dedupe authors, and clamp the year to a sane range. Pure so it
 * can be unit tested without invoking the model.
 */
export function normalizeLlmPaperMetadata(raw: {
  title?: string;
  abstract?: string;
  doi?: string;
  authors?: string[];
  journal?: string;
  publishedYear?: number;
}): NormalizedLlmPaperMetadata {
  const seen = new Set<string>();
  const authors: string[] = [];
  for (const candidate of raw.authors ?? []) {
    const name = cleanString(candidate, 200);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    authors.push(name);
  }

  const year =
    typeof raw.publishedYear === "number" &&
    Number.isInteger(raw.publishedYear) &&
    raw.publishedYear >= MIN_PUBLICATION_YEAR &&
    raw.publishedYear <= MAX_PUBLICATION_YEAR
      ? raw.publishedYear
      : undefined;

  return {
    title: cleanString(raw.title, 500),
    abstract: cleanString(raw.abstract, 4000),
    doi: cleanString(raw.doi, 200)?.toLowerCase(),
    authors,
    journal: cleanString(raw.journal, 300),
    publishedYear: year,
  };
}
