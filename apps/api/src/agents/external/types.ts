// Shared types for external research providers (arxiv, crossref, pubmed,
// fetch_url, pdf_extract). Kept outside `mcp/` because none of these are
// MCP-based — they are direct HTTP integrations that follow the same
// "tool-callable provider" contract as Exa.

export type ResearchProvider =
  | "exa"
  | "arxiv"
  | "crossref"
  | "pubmed"
  | "direct"
  | "memory";

export type CandidateSource = {
  /** Canonical landing page URL (https://...) — required. */
  url: string;
  title: string;
  /** Abstract / description. Null when the provider does not return one. */
  snippet: string | null;
  /** ISO-ish date string when known. */
  publishedDate: string | null;
  authors: string[];
  /** DOI without `https://doi.org/` prefix. Null when unknown. */
  doi: string | null;
  provider: ResearchProvider;
  /**
   * Provider-specific raw payload kept for debugging / future enrichment.
   * Not exposed to the LLM — tools must strip this before returning.
   */
  raw?: Record<string, unknown>;
};

export type FetchedDocument = {
  /** URL the caller requested. */
  url: string;
  /** URL after following redirects. */
  finalUrl: string;
  title: string | null;
  byline: string | null;
  publishedTime: string | null;
  /** Plain text extracted via Readability. May be empty. */
  textContent: string;
  excerpt: string | null;
  /** Character count of `textContent` after extraction. */
  length: number;
  contentType: string | null;
  /** True when the upstream response was cut off by `MAX_BYTES`. */
  truncated: boolean;
};

export type ExtractedPdf = {
  url: string;
  pages: number;
  textContent: string;
  meta: {
    title: string | null;
    author: string | null;
    creationDate: string | null;
  };
  /** True when the upstream response was cut off by `MAX_BYTES`. */
  truncated: boolean;
};

/** Thrown when a URL is reachable but is not HTML — caller can fall back to PDF extraction. */
export class NotHtmlError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly contentType: string | null,
  ) {
    super(message);
    this.name = "NotHtmlError";
  }
}

/** Thrown when an upstream HTTP fetch fails (network error or non-2xx status). */
export class HttpFetchError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = "HttpFetchError";
  }
}

/** Thrown when a response exceeds `ASTRA_FETCH_MAX_BYTES` and we abort the read. */
export class ResponseTooLargeError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly limit: number,
  ) {
    super(message);
    this.name = "ResponseTooLargeError";
  }
}
