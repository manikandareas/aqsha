// Kontrak citation dari @aqsha/api (CitationService/CitationImportService di
// @aqsha/services). apps/web tidak meng-import services — tipe dicermin manual
// (pola sama dengan features/threads/types).

export type CitationAuthor = { family?: string; given?: string; literal?: string };
export type CitationSource = "import" | "provider_sync" | "artifact" | "doi" | "manual";
export type CitationMetadataStatus = "verified" | "needs_review" | "incomplete";
export type CitationStyleId = "apa-7" | "ieee" | "vancouver" | "chicago-author-date";
export type BibliographySort = "author" | "year" | "title";
export type ImportDuplicatePolicy = "skip" | "merge" | "import";

export type CitationListItem = {
  id: string;
  documentType: string;
  title: string;
  authors: CitationAuthor[];
  publishedYear: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  tags: string[];
  source: CitationSource;
  metadataStatus: CitationMetadataStatus;
  artifactId: string | null;
  updatedAt: number;
};

export type CitationDetail = CitationListItem & {
  publisher: string | null;
  cslJson: unknown;
  canonicalKey: string;
  reviewedAt: number | null;
  createdAt: number;
  deletedAt: number | null;
};

export type CitationListResponse = {
  items: CitationListItem[];
  nextCursor: string | null;
  total: number;
};

export type ManualCitationFields = {
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

export type ImportPreviewRecord = {
  index: number;
  title: string;
  authors: CitationAuthor[];
  publishedYear: number | null;
  venue: string | null;
  doi: string | null;
  documentType: string;
  metadataStatus: CitationMetadataStatus;
  issues: string[];
  duplicateOfId: string | null;
  duplicateOfTitle: string | null;
  duplicateInBatch: boolean;
};

export type ImportPreviewResult = {
  batchId: string;
  format: "bibtex" | "ris";
  counts: { total: number; valid: number; incomplete: number; duplicate: number; error: number };
  records: ImportPreviewRecord[];
  errors: Array<{ index: number; message: string; raw: string }>;
};

export type ImportCommitResult = { created: number; merged: number; skipped: number };

export type CitationSettings = {
  defaultStyleId: CitationStyleId;
  bibliographySort: BibliographySort;
};

export type CitationRenderResult = {
  styleId: CitationStyleId;
  entries: Array<{ id: string; text: string }>;
  bibliography: string;
};

export const CITATION_STYLE_OPTIONS: Array<{ id: CitationStyleId; label: string }> = [
  { id: "apa-7", label: "APA 7" },
  { id: "ieee", label: "IEEE" },
  { id: "vancouver", label: "Vancouver" },
  { id: "chicago-author-date", label: "Chicago author-date" },
];

export const BIBLIOGRAPHY_SORT_OPTIONS: Array<{ id: BibliographySort; label: string }> = [
  { id: "author", label: "Urutan gaya (penulis)" },
  { id: "year", label: "Tahun terbaru" },
  { id: "title", label: "Judul A–Z" },
];

export const CITATION_STATUS_LABELS: Record<CitationMetadataStatus, string> = {
  verified: "terverifikasi",
  needs_review: "perlu review",
  incomplete: "belum lengkap",
};

export const CITATION_SOURCE_LABELS: Record<CitationSource, string> = {
  import: "import",
  provider_sync: "sinkron",
  artifact: "artifact",
  doi: "DOI",
  manual: "manual",
};

/** Nama penulis untuk display ringkas (cermin `formatAuthorDisplay` services). */
export function formatCitationAuthor(author: CitationAuthor): string {
  if (author.literal) return author.literal;
  if (author.family) return author.given ? `${author.family}, ${author.given}` : author.family;
  return author.given ?? "";
}

/** Baris meta ringkas: first author + tahun · venue. */
export function citationMetaLine(item: {
  authors: CitationAuthor[];
  publishedYear: number | null;
  venue: string | null;
}): string {
  const first = item.authors[0] ? formatCitationAuthor(item.authors[0]) : null;
  const extra = item.authors.length > 1 ? " dkk." : "";
  const head = [first ? `${first}${extra}` : null, item.publishedYear]
    .filter(Boolean)
    .join(" · ");
  return [head || null, item.venue].filter(Boolean).join(" · ");
}
