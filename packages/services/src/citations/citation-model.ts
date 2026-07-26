import type {
  ArtifactPaperMetadata,
  BibliographySort,
  Citation,
  CitationAuthor,
  CitationIngestStatus,
  CitationMetadataStatus,
  CitationProvider,
  CitationSource,
  CitationStyleId,
  CitationTextCoverage,
  DbOrTx,
  NewCitation,
} from "@aqsha/db";
import { CitationRepo, throwAppError } from "@aqsha/db";
import type { ResolvedPaper } from "../papers/resolve";
import {
  buildCslFromManualInput,
  canonicalKeyForCsl,
  cslItemToColumns,
  type CslItem,
  metadataStatusFor,
  normalizeTags,
} from "./citation-normalize";

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;
export const DEFAULT_STYLE: CitationStyleId = "apa-7";
export const DEFAULT_SORT: BibliographySort = "author";

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
  /** Kemajuan pipeline ingest item ini — dipakai kartu perpustakaan untuk melapor. */
  ingestStatus: CitationIngestStatus;
  textCoverage: CitationTextCoverage;
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
  /** Jumlah dokumen yang memakai citation ini (hanya diisi oleh `get`). */
  usageCount?: number;
};

export type CitationSettingsView = {
  defaultStyleId: CitationStyleId;
  bibliographySort: BibliographySort;
};

/** Hasil `createFromArtifact` — `created=false` bila artifact sudah tertaut / dedupe. */
export type CreateFromArtifactResult = {
  citation: CitationDetail;
  created: boolean;
  linkedExisting: boolean;
};

/** Grup kandidat duplikat (canonical key sama, ≥2 anggota aktif). */
export type CitationDuplicateGroup = {
  canonicalKey: string;
  members: CitationListItem[];
};

export function toListItem(row: Citation): CitationListItem {
  return {
    id: row.id,
    documentType: row.documentType,
    title: row.title,
    authors: row.authorsJson,
    publishedYear: row.publishedYear,
    venue: row.venue,
    doi: row.doi,
    url: row.url,
    tags: row.tags,
    source: row.source as CitationSource,
    metadataStatus: row.metadataStatus as CitationMetadataStatus,
    ingestStatus: row.ingestStatus,
    textCoverage: row.textCoverage,
    artifactId: row.artifactId,
    updatedAt: row.updatedAt,
  };
}

export function toDetail(row: Citation): CitationDetail {
  return {
    ...toListItem(row),
    publisher: row.publisher,
    cslJson: row.cslJson,
    canonicalKey: row.canonicalKey,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
  };
}

export async function requireCitation(
  db: DbOrTx,
  ownerUserId: string,
  citationId: string,
  options: { allowDeleted?: boolean } = {},
): Promise<Citation> {
  const row = await CitationRepo.findById(db, ownerUserId, citationId);
  if (!row || (!options.allowDeleted && row.deletedAt)) {
    throwAppError({
      message: "Referensi tidak ditemukan",
      code: "citation_not_found",
      status: 404,
    });
  }
  return row;
}

/** Duplikat aktif by canonical key milik owner; null bila tidak ada. */
export async function findActiveDuplicate(
  db: DbOrTx,
  ownerUserId: string,
  canonicalKey: string,
): Promise<Citation | null> {
  const hits = await CitationRepo.findActiveByCanonicalKeys(db, ownerUserId, [
    canonicalKey,
  ]);
  return hits[0] ?? null;
}

export function rowFromCsl(input: {
  ownerUserId: string;
  source: CitationSource;
  csl: CslItem;
  tags: string[];
  now: number;
  artifactId?: string | null;
  provider?: CitationProvider | null;
  externalId?: string | null;
}): NewCitation {
  const columns = cslItemToColumns(input.csl);
  return {
    id: crypto.randomUUID(),
    ownerUserId: input.ownerUserId,
    artifactId: input.artifactId ?? null,
    source: input.source,
    provider: input.provider ?? null,
    externalId: input.externalId ?? null,
    documentType: columns.documentType,
    title: columns.title,
    authorsJson: columns.authors,
    publishedYear: columns.publishedYear,
    venue: columns.venue,
    publisher: columns.publisher,
    doi: columns.doi,
    url: columns.url,
    tags: normalizeTags(input.tags),
    cslJson: input.csl,
    canonicalKey: canonicalKeyForCsl(input.csl),
    metadataStatus: metadataStatusFor(input.source, columns),
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/** Nama penuh provider ("Given Family" / "Family, Given") → CitationAuthor. */
export function authorFromName(name: string): CitationAuthor {
  const trimmed = name.trim();
  if (!trimmed) return { literal: name };
  if (trimmed.includes(",")) {
    const [family, given] = trimmed.split(",", 2).map((s) => s.trim());
    if (family) return given ? { family, given } : { family };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { literal: trimmed };
  const family = parts[parts.length - 1] as string;
  return { family, given: parts.slice(0, -1).join(" ") };
}

/** Peta hasil resolver DOI/arXiv (`ResolvedPaper`) → CSL-JSON. Hanya field terisi. */
export function buildCslFromResolvedPaper(paper: ResolvedPaper): CslItem {
  const csl: CslItem = {
    type: "article-journal",
    title: paper.title,
    author: paper.authors.map((a) => authorFromName(a.name)),
  };
  if (paper.publishedYear)
    csl.issued = { "date-parts": [[paper.publishedYear]] };
  if (paper.journal) csl["container-title"] = paper.journal;
  if (paper.publisher) csl.publisher = paper.publisher;
  if (paper.doi) csl.DOI = paper.doi;
  if (paper.landingPageUrl) csl.URL = paper.landingPageUrl;
  if (paper.abstract) csl.abstract = paper.abstract;
  return csl;
}

/** Peta `artifact_paper_metadata` → CSL-JSON (artifact bridge). Hanya field terisi. */
export function buildCslFromPaperMetadata(
  meta: ArtifactPaperMetadata,
): CslItem {
  const csl: CslItem = { type: "article-journal", title: meta.title ?? "" };
  const authors = (meta.authors ?? [])
    .map((a) => authorFromName(a.name))
    .filter((a) => a.literal || a.family || a.given);
  if (authors.length > 0) csl.author = authors;
  if (meta.publishedYear) csl.issued = { "date-parts": [[meta.publishedYear]] };
  if (meta.journal) csl["container-title"] = meta.journal;
  if (meta.publisher) csl.publisher = meta.publisher;
  if (meta.doi) csl.DOI = meta.doi;
  if (meta.sourceUrl) csl.URL = meta.sourceUrl;
  if (meta.abstract) csl.abstract = meta.abstract;
  return csl;
}

/** Skor kelengkapan metadata — dipakai memilih target default saat merge banyak. */
export function completenessScore(row: Citation): number {
  let score = 0;
  if (row.doi) score += 3;
  if (row.authorsJson.length > 0) score += 2;
  if (row.publishedYear !== null) score += 1;
  if (row.venue) score += 1;
  if (row.publisher) score += 1;
  if (row.url) score += 1;
  if (row.metadataStatus === "verified") score += 2;
  score += row.tags.length; // referensi yang sudah dikurasi diutamakan
  return score;
}

/** Target merge default: paling lengkap; seri → yang lebih dulu dibuat (identitas stabil). */
export function pickMergeTarget(rows: Citation[]): Citation {
  return rows.reduce((best, row) => {
    const a = completenessScore(row);
    const b = completenessScore(best);
    if (a > b) return row;
    if (a === b && row.createdAt < best.createdAt) return row;
    return best;
  });
}
