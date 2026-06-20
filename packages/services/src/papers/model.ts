/**
 * Shared paper-domain types for the resolution stack. Ported from V1
 * `papers/ingest/model.ts` + `lib/paperTypes.ts`. Dependency-free leaf module.
 */

/** A single paper author: display name plus an optional primary affiliation. */
export type PaperAuthor = { name: string; affiliation?: string };

export type PaperMetadataSource =
  | "openalex"
  | "crossref"
  | "arxiv"
  | "semantic_scholar"
  | "datacite";

export type ResolvedPaper = {
  doi?: string;
  arxivId?: string;
  title?: string;
  abstract?: string;
  authors: PaperAuthor[];
  affiliations: string[];
  journal?: string;
  publisher?: string;
  publishedYear?: number;
  metadataSource: PaperMetadataSource;
  oaStatus?: string;
  /** Ordered, deduped candidate open-access PDF URLs (try first -> last). */
  pdfCandidates: string[];
  landingPageUrl?: string;
};

export type PartialPaper = Partial<Omit<ResolvedPaper, "pdfCandidates">> & {
  pdfCandidates?: string[];
};

export type ArxivPartial = PartialPaper & { publishedDoi?: string };
