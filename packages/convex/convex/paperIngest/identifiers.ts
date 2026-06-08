/**
 * Pure helpers (no I/O) for recognising scholarly identifiers inside an
 * arbitrary user-pasted URL or string, so the ingestion pipeline can branch
 * between the academic (DOI/arXiv/PMID → metadata + PDF) path and the generic
 * web-crawl path. Kept side-effect free so it can be unit tested and shared.
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
const DOI_RE = /10\.\d{4,9}\/[-._;()/:a-z0-9]+/i;

const PMID_RE =
  /(?:pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov\/pubmed)\/(\d+)/i;

// Academic publishers + "popular research sharing sites" (per dialog copy).
const ACADEMIC_DOMAINS = [
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

/** Whether the ingestion pipeline should try the academic (paper) branch. */
export function isAcademicIdentifier(classified: ClassifiedUrl): boolean {
  return classified.kind !== "generic";
}
