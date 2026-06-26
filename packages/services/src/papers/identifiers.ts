/**
 * Pure helpers (no I/O) for recognising scholarly identifiers inside an
 * arbitrary user-pasted URL or string, plus document-text classification for
 * uploaded PDFs. Ported faithfully from V1 `papers/ingest/identifiers.ts` and
 * `papers/ingest/uploadIdentifiers.ts` (the `classifyPaperText` half). Kept
 * side-effect free so it can be unit tested and shared by BullMQ workers.
 */

export type PaperIdentifierKind = "doi" | "arxiv" | "pmid" | "generic";

export type ClassifiedUrl = {
  kind: PaperIdentifierKind;
  /** Normalised DOI: lowercase, no `doi.org/` prefix. */
  doi?: string;
  /** arXiv id without version, e.g. `1304.0445` or `math/9901001`. */
  arxivId?: string;
  pmid?: string;
  /** Host label when the URL is a known academic / research-sharing site. */
  publisherHint?: string;
  /** True when the host is a recognised academic / research-sharing domain. */
  academicDomain: boolean;
  raw: string;
};

// Crossref-recommended primary DOI pattern (~99.3% of real DOIs).
export const DOI_RE = /10\.\d{4,9}\/[-._;()/:a-z0-9]+/i;

export const PMID_RE =
  /(?:pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov\/pubmed)\/(\d+)/i;

// Academic publishers + "popular research sharing sites" (per dialog copy).
export const ACADEMIC_DOMAINS = [
  "arxiv.org",
  "biorxiv.org",
  "medrxiv.org",
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "sciencedirect.com",
  "link.springer.com",
  "springer.com",
  "nature.com",
  "ieeexplore.ieee.org",
  "dl.acm.org",
  "onlinelibrary.wiley.com",
  "mdpi.com",
  "researchgate.net",
  "semanticscholar.org",
  "ssrn.com",
  "papers.ssrn.com",
  "doi.org",
  "dx.doi.org",
  "aclanthology.org",
  "openreview.net",
  "pubs.acs.org",
  "tandfonline.com",
  "journals.plos.org",
  "frontiersin.org",
];

// Heading that marks the end of a paper's front matter and the start of its
// bibliography. Identifiers after this point belong to CITED works.
const REFERENCES_HEADING_RE =
  /\n\s*(references|bibliography|works\s+cited|literature\s+cited)\s*\n/i;

// Hard cap on the header window even when no References heading is found, so a
// DOI buried deep in the body (typically a citation) can't be mistaken for the
// paper's own identifier.
const MAX_HEADER_CHARS = 3000;

function hostOf(value: string): string | null {
  try {
    return new URL(value.trim()).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function academicHint(host: string | null): string | null {
  if (!host) return null;
  return (
    ACADEMIC_DOMAINS.find(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    ) ?? null
  );
}

/**
 * Canonical DOI normalizer (loose): strips a `https?://(dx.)?doi.org/` prefix
 * AND a leading `doi:` prefix, then lowercases. Trims surrounding whitespace.
 * Ported from V1 `lib/identifiers.ts`.
 */
export function normalizeDoi(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "")
    .toLowerCase();
}

/** Extract + clean the first DOI found anywhere in the input, or undefined. */
export function extractDoi(value: string): string | undefined {
  const match = value.match(DOI_RE);
  if (!match) return undefined;
  // Cut URL query/fragment, but keep DOI-legal chars. '(' and ')' are legal in
  // DOIs (e.g. 10.1002/(SICI)1097-...), so only drop a trailing ')' when it is
  // unbalanced — i.e. it was scraped from surrounding prose like "(… 10.x/y)".
  // A balanced trailing ')' is preserved; other prose punctuation always goes.
  let doi = match[0].split(/[?#\s<>]/)[0];
  for (;;) {
    const stripped = doi.replace(/[.,;:'"\]]+$/, "");
    if (
      stripped.endsWith(")") &&
      (stripped.match(/\)/g) ?? []).length > (stripped.match(/\(/g) ?? []).length
    ) {
      doi = stripped.slice(0, -1);
      continue;
    }
    doi = stripped;
    break;
  }
  return doi.toLowerCase();
}

/** Extract an arXiv id (no version) from a URL, `arXiv:` string, or DOI. */
export function extractArxivId(value: string): string | undefined {
  const input = value.trim();
  // arXiv DOI form: 10.48550/arXiv.2301.10140
  const doiForm = input.match(/10\.48550\/arxiv\.(.+)/i);
  if (doiForm) {
    return stripArxivVersion(doiForm[1]);
  }
  const hasArxivContext =
    /arxiv\.org\/(?:abs|pdf|html|format)\//i.test(input) ||
    /arxiv:/i.test(input);
  if (hasArxivContext) {
    const newId = input.match(
      /arxiv\.org\/(?:abs|pdf|html|format)\/(\d{4}\.\d{4,5})/i,
    );
    if (newId) return newId[1];
    const oldId = input.match(
      /arxiv\.org\/(?:abs|pdf|html|format)\/([a-z-]+(?:\.[a-z]{2})?\/\d{7})/i,
    );
    if (oldId) return oldId[1].toLowerCase();
    const prefixed = input.match(
      /arxiv:\s*(\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})/i,
    );
    if (prefixed) return stripArxivVersion(prefixed[1]).toLowerCase();
  }
  // Bare id pasted on its own (e.g. "1304.0445" or "math/9901001").
  if (/^\d{4}\.\d{4,5}(?:v\d+)?$/i.test(input)) {
    return stripArxivVersion(input);
  }
  if (/^[a-z-]+(?:\.[a-z]{2})?\/\d{7}(?:v\d+)?$/i.test(input)) {
    return stripArxivVersion(input).toLowerCase();
  }
  return undefined;
}

function stripArxivVersion(id: string): string {
  return id.trim().replace(/v\d+$/i, "");
}

/** Direct PDF URL for an arXiv id (latest version). */
export function arxivPdfUrl(arxivId: string): string {
  return `https://arxiv.org/pdf/${arxivId}`;
}

/** Canonical abstract/landing URL for an arXiv id. */
export function arxivAbsUrl(arxivId: string): string {
  return `https://arxiv.org/abs/${arxivId}`;
}

export function classifyUrl(input: string): ClassifiedUrl {
  const raw = input.trim();
  const host = hostOf(raw);
  const publisherHint = academicHint(host) ?? undefined;
  const academicDomain = Boolean(publisherHint);

  // arXiv first — an arXiv 10.48550 DOI should classify as arxiv, and arXiv
  // ids are unambiguous in arxiv context.
  const arxivId = extractArxivId(raw);
  if (arxivId) {
    return { kind: "arxiv", arxivId, academicDomain, publisherHint, raw };
  }

  const doi = extractDoi(raw);
  if (doi) {
    return { kind: "doi", doi, academicDomain, publisherHint, raw };
  }

  const pmidMatch = raw.match(PMID_RE);
  if (pmidMatch) {
    return {
      kind: "pmid",
      pmid: pmidMatch[1],
      academicDomain,
      publisherHint,
      raw,
    };
  }

  return { kind: "generic", academicDomain, publisherHint, raw };
}

/**
 * The front-matter slice of a paper where its own DOI/arXiv id is printed:
 * everything before the References/Bibliography heading, capped at
 * MAX_HEADER_CHARS.
 */
function paperHeaderRegion(text: string): string {
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
 * Only the paper's header region is searched so a DOI/arXiv id from the
 * References section can't resolve a CITED paper's metadata. Returns `null`
 * when no academic identifier is present in the header.
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

/** Whether the ingestion pipeline should try the academic (paper) branch. */
export function isAcademicIdentifier(classified: ClassifiedUrl): boolean {
  return classified.kind !== "generic";
}
