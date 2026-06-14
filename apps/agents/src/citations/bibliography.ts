import { collapse } from "../lib/text";
import { normalizeArxivId, normalizeDoi } from "../lib/identifiers";
import type { CitationInput } from "./integrity";

// Heuristic bibliography extraction for the verifyCitations tool. The legacy
// runtime used an LLM extraction pass; the service starts with a deterministic
// parser (testable, free) that handles the dominant cases: a references section
// with one entry per line/paragraph, DOIs, arXiv ids, years, and quoted or
// sentence-case titles. The engine itself is conservative, so imperfect parses
// degrade to "unverifiable" rather than false flags.

const REFERENCE_HEADINGS =
  /^#{0,6}\s*(references|bibliography|daftar\s+pustaka|referensi)\s*:?\s*$/im;

const DOI_PATTERN = /\b(10\.\d{4,9}\/[^\s"'<>)\],;]+)/i;
const ARXIV_PATTERN = /\barxiv[:\s/]*(\d{4}\.\d{4,5})(v\d+)?\b/i;
const YEAR_PATTERN = /\((19|20)\d{2}[a-z]?\)|\b(19|20)\d{2}\b/;

/** Slice the references section out of a document (or return null). */
export function extractReferencesSection(text: string): string | null {
  const match = REFERENCE_HEADINGS.exec(text);
  if (!match || match.index === undefined) {
    return null;
  }
  return text.slice(match.index + match[0].length).trim() || null;
}

/** Split a references section into individual entries. */
export function splitReferenceEntries(section: string): string[] {
  // Numbered entries ("[1] ..." / "1. ...") or blank-line separated paragraphs.
  const numbered = section.split(/\n(?=\s*(?:\[\d{1,3}\]|\d{1,3}\.)\s+)/);
  const parts =
    numbered.length > 1
      ? numbered
      : section.split(/\n{2,}/).flatMap((block) =>
          // Single-spaced reference lists: split on newline when most lines
          // look like full entries (contain a year or DOI).
          block.split(/\n(?=[A-Z[])/),
        );
  return parts.map((entry) => collapse(entry)).filter((entry) => entry.length >= 20);
}

function cleanTitleFragment(fragment: string): string {
  return collapse(
    fragment
      .replace(/^[\s.,;:–—-]+/, "")
      .replace(/[\s.,;:–—-]+$/, "")
      .replace(/^["'“”]+|["'“”]+$/g, ""),
  );
}

/** Best-effort title guess: quoted span, else span after the (year). */
export function guessTitle(entry: string): string {
  const quoted = entry.match(/["“]([^"”]{8,300})["”]/);
  if (quoted?.[1]) {
    return cleanTitleFragment(quoted[1]);
  }
  const afterYear = entry.match(/\((?:19|20)\d{2}[a-z]?\)\s*\.?\s*([^.]{8,300})\./);
  if (afterYear?.[1]) {
    return cleanTitleFragment(afterYear[1]);
  }
  // Fallback: longest sentence-ish span, minus leading "[n]" markers.
  const stripped = entry.replace(/^\s*(?:\[\d{1,3}\]|\d{1,3}\.)\s*/, "");
  const sentences = stripped
    .split(/(?<=[a-z0-9])\.\s+/)
    .map(cleanTitleFragment)
    .filter((s) => s.length >= 8);
  return sentences.sort((a, b) => b.length - a.length)[0] ?? cleanTitleFragment(stripped);
}

function guessAuthors(entry: string): string[] | undefined {
  // Take the span before the (year) marker and split on common separators.
  const beforeYear = entry.split(/\((?:19|20)\d{2}[a-z]?\)/)[0];
  if (!beforeYear || beforeYear.length > 220) {
    return undefined;
  }
  const authors = beforeYear
    .replace(/^\s*(?:\[\d{1,3}\]|\d{1,3}\.)\s*/, "")
    .split(/;|,\s*&\s*|\s+&\s+|\band\b|\bdan\b/i)
    .map((author) => collapse(author.replace(/[.,]+$/, "")))
    .filter((author) => author.length >= 3 && /[a-z]/i.test(author));
  return authors.length > 0 ? authors.slice(0, 8) : undefined;
}

/** Parse one reference entry into a CitationInput. */
export function parseReferenceEntry(entry: string): CitationInput | null {
  const compact = collapse(entry);
  if (compact.length < 20) {
    return null;
  }
  const doiMatch = DOI_PATTERN.exec(compact);
  const arxivMatch = ARXIV_PATTERN.exec(compact);
  const yearMatch = YEAR_PATTERN.exec(compact);
  const title = guessTitle(compact);
  if (!title) {
    return null;
  }
  const yearText = yearMatch?.[0]?.replace(/[()a-z]/gi, "");
  return {
    title,
    authors: guessAuthors(compact),
    year: yearText ? Number(yearText) : undefined,
    doi: doiMatch?.[1] ? normalizeDoi(doiMatch[1].replace(/[.,;]+$/, "")) : undefined,
    arxivId: arxivMatch ? (normalizeArxivId(arxivMatch[0]) ?? undefined) : undefined,
  };
}

export const MAX_CITATIONS = 60;

/** Extract every parseable citation from a document. */
export function extractCitations(text: string): CitationInput[] {
  const section = extractReferencesSection(text);
  if (!section) {
    return [];
  }
  return splitReferenceEntries(section)
    .map(parseReferenceEntry)
    .filter((citation): citation is CitationInput => Boolean(citation))
    .slice(0, MAX_CITATIONS);
}
