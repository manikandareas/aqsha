import { createHash } from "node:crypto";
import type { CitationAuthor, CitationMetadataStatus, CitationSource } from "@aqsha/db";
import { normalizeDoi } from "../papers/identifiers";

/** Item CSL-JSON longgar — canonical payload citation (lihat ADR csl engine). */
export type CslItem = Record<string, unknown> & { type?: string };

/** Kolom read-model `workspace_citations` yang diturunkan dari CSL-JSON. */
export type CitationColumns = {
  documentType: string;
  title: string;
  authors: CitationAuthor[];
  publishedYear: number | null;
  venue: string | null;
  publisher: string | null;
  doi: string | null;
  url: string | null;
};

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;

export { normalizeDoi };

/** Normalisasi ISBN: buang separator, uppercase X; valid hanya panjang 10/13. */
export function normalizeIsbn(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  return compact.length === 10 || compact.length === 13 ? compact : null;
}

/** Kunci judul ternormalisasi: NFKD tanpa diacritics, lowercase, alfanumerik saja. */
function normalizedTitleKey(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Canonical key kandidat duplikat: `doi:` → `isbn:` → hash `title+year+first-author`.
 * Fallback title HANYA kandidat (bukan hard-unique) — false positive di-approve user.
 */
export function canonicalKeyFor(input: {
  doi: string | null;
  isbn: string | null;
  title: string;
  publishedYear: number | null;
  firstAuthorFamily: string | null;
}): string {
  if (input.doi) return `doi:${input.doi}`;
  if (input.isbn) return `isbn:${input.isbn}`;
  const basis = [
    normalizedTitleKey(input.title),
    input.publishedYear ?? "",
    normalizedTitleKey(input.firstAuthorFamily ?? ""),
  ].join("|");
  return `ttl:${createHash("sha256").update(basis).digest("hex").slice(0, 24)}`;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function authorsFromCsl(csl: CslItem): CitationAuthor[] {
  const raw = csl.author;
  if (!Array.isArray(raw)) return [];
  const authors: CitationAuthor[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const a = entry as Record<string, unknown>;
    const literal = asString(a.literal);
    const family = asString(a.family);
    const given = asString(a.given);
    if (literal) authors.push({ literal });
    // Corporate author yang ter-parse family-only → perlakukan sebagai literal.
    else if (family && !given) authors.push({ literal: family });
    else if (family || given) {
      authors.push({ ...(family ? { family } : {}), ...(given ? { given } : {}) });
    }
  }
  return authors;
}

function yearFromCsl(csl: CslItem): number | null {
  const issued = csl.issued as { "date-parts"?: unknown } | undefined;
  const parts = issued?.["date-parts"];
  if (Array.isArray(parts) && Array.isArray(parts[0])) {
    const year = Number(parts[0][0]);
    if (Number.isInteger(year) && year > 0) return year;
  }
  return null;
}

/** Turunkan kolom read-model dari satu item CSL-JSON. Tidak mengarang data hilang. */
export function cslItemToColumns(csl: CslItem): CitationColumns {
  const doiRaw = asString(csl.DOI);
  return {
    documentType: asString(csl.type) ?? "document",
    title: asString(csl.title) ?? "",
    authors: authorsFromCsl(csl),
    publishedYear: yearFromCsl(csl),
    venue: asString(csl["container-title"]),
    publisher: asString(csl.publisher),
    doi: doiRaw ? normalizeDoi(doiRaw) : null,
    url: asString(csl.URL),
  };
}

export function canonicalKeyForCsl(csl: CslItem): string {
  const cols = cslItemToColumns(csl);
  const first = cols.authors[0];
  return canonicalKeyFor({
    doi: cols.doi,
    isbn: normalizeIsbn(asString(csl.ISBN)),
    title: cols.title,
    publishedYear: cols.publishedYear,
    firstAuthorFamily: first?.family ?? first?.literal ?? null,
  });
}

/** Isu kualitas metadata (per-field, untuk preview import + detail). */
export function metadataIssuesFor(cols: CitationColumns): string[] {
  const issues: string[] = [];
  if (!cols.title) issues.push("judul tidak ditemukan");
  if (cols.authors.length === 0) issues.push("penulis tidak ditemukan");
  if (cols.publishedYear === null) issues.push("tahun terbit tidak ditemukan");
  return issues;
}

/**
 * Status kualitas: field inti hilang → `incomplete`; hasil resolver DOI / entry
 * manual → `verified`; import/sync/artifact belum direview → `needs_review`.
 */
export function metadataStatusFor(
  source: CitationSource,
  cols: CitationColumns,
): CitationMetadataStatus {
  if (!cols.title || cols.authors.length === 0 || cols.publishedYear === null) {
    return "incomplete";
  }
  return source === "doi" || source === "manual" ? "verified" : "needs_review";
}

export type ManualCitationInput = {
  documentType?: string;
  title: string;
  authors?: CitationAuthor[];
  publishedYear?: number | null;
  venue?: string | null;
  publisher?: string | null;
  doi?: string | null;
  url?: string | null;
  isbn?: string | null;
};

/** Bangun CSL-JSON dari form manual — hanya field terisi yang masuk payload. */
export function buildCslFromManualInput(input: ManualCitationInput): CslItem {
  const csl: CslItem = { type: asString(input.documentType) ?? "document" };
  const title = asString(input.title);
  if (title) csl.title = title;
  if (input.authors && input.authors.length > 0) csl.author = input.authors;
  if (typeof input.publishedYear === "number") {
    csl.issued = { "date-parts": [[input.publishedYear]] };
  }
  const venue = asString(input.venue);
  if (venue) csl["container-title"] = venue;
  const publisher = asString(input.publisher);
  if (publisher) csl.publisher = publisher;
  const doi = asString(input.doi);
  if (doi) csl.DOI = normalizeDoi(doi);
  const url = asString(input.url);
  if (url) csl.URL = url;
  const isbn = normalizeIsbn(input.isbn);
  if (isbn) csl.ISBN = isbn;
  return csl;
}

/** Rapikan tags: trim, buang kosong/duplikat (case-insensitive), cap jumlah+panjang. */
export function normalizeTags(tags: string[] | null | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const clean = tag.trim().slice(0, MAX_TAG_LENGTH);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= MAX_TAGS) break;
  }
  return result;
}

/** Nama penulis untuk display ringkas ("Family, Given" / literal). */
export function formatAuthorDisplay(author: CitationAuthor): string {
  if (author.literal) return author.literal;
  if (author.family) return author.given ? `${author.family}, ${author.given}` : author.family;
  return author.given ?? "";
}
