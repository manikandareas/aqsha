/**
 * Normalisasi kanonik OpenAlex work → paper. Lane feed dan pencarian literatur membaca daftar
 * `select` yang sama dan melewati mapper yang sama, jadi satu paper tampak identik dari surface
 * mana pun ia datang. Leaf module: `feed/` dan `literature-search/` sejajar dan tak boleh saling
 * impor, jadi milik bersama tinggal di sini.
 */
import { canonicalPaperKey, type ExplorePaperInput } from "../explore/model";
import { collapse, firstNonEmpty, numberOrUndefined, uniqueCompact } from "../lib/text";
import { normalizeDoi } from "./identifiers";
import { reconstructOpenAlexAbstract } from "./providers";

/** Satu-satunya daftar `select` OpenAlex — inilah yang menjamin feed dan search dapat field sama. */
export const LITERATURE_WORK_SELECT = [
  "id",
  "ids",
  "display_name",
  "title",
  "doi",
  "publication_year",
  "publication_date",
  "cited_by_count",
  "type",
  "language",
  "is_retracted",
  "abstract_inverted_index",
  "open_access",
  "best_oa_location",
  "primary_location",
  "authorships",
  "primary_topic",
  "topics",
].join(",");

type OpenAlexLocation = {
  landing_page_url?: string | null;
  pdf_url?: string | null;
  is_oa?: boolean | null;
  source?: { display_name?: string | null } | null;
};

type OpenAlexTopic = {
  display_name?: string | null;
  field?: { display_name?: string | null } | null;
  subfield?: { display_name?: string | null } | null;
};

export type OpenAlexWorkPayload = {
  id?: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  cited_by_count?: number | null;
  type?: string | null;
  language?: string | null;
  is_retracted?: boolean | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  primary_location?: OpenAlexLocation | null;
  best_oa_location?: OpenAlexLocation | null;
  open_access?: {
    is_oa?: boolean | null;
    oa_status?: string | null;
    oa_url?: string | null;
  } | null;
  authorships?: Array<{
    author?: { display_name?: string | null } | null;
    raw_author_name?: string | null;
  }> | null;
  primary_topic?: OpenAlexTopic | null;
  topics?: OpenAlexTopic[] | null;
  ids?: { openalex?: string | null; doi?: string | null } | null;
};

/** Bentuk paper bersama feed dan hasil pencarian. Tak ada bentuk lain di jalur mana pun. */
export type LiteraturePaper = {
  key: string;
  title: string;
  snippet: string | null;
  doi: string | null;
  url: string | null;
  pdfUrl: string | null;
  hasPdf: boolean;
  authors: string[];
  year: number | null;
  publicationDate: string | null;
  venue: string | null;
  citedByCount: number | null;
  isOpenAccess: boolean;
  oaStatus: string | null;
  workType: string | null;
  language: string | null;
  isRetracted: boolean;
  topics: string[];
};

export function mapOpenAlexWork(work: OpenAlexWorkPayload): LiteraturePaper | null {
  const title = collapse(work.display_name ?? work.title ?? "");
  if (!title) return null;

  const openalexId = work.ids?.openalex ?? work.id ?? null;
  const doi = normalizeDoi(work.ids?.doi ?? work.doi ?? "") || null;
  const location = work.best_oa_location ?? work.primary_location ?? null;
  const pdfUrl = firstNonEmpty(work.best_oa_location?.pdf_url, location?.pdf_url) || null;
  const url =
    firstNonEmpty(
      work.open_access?.oa_url,
      location?.landing_page_url,
      doi ? `https://doi.org/${doi}` : null,
      openalexId,
    ) || null;

  const abstract = reconstructOpenAlexAbstract(work.abstract_inverted_index);
  const topics = uniqueCompact([
    work.primary_topic?.display_name,
    work.primary_topic?.subfield?.display_name,
    work.primary_topic?.field?.display_name,
    ...(work.topics ?? []).map((topic) => topic.display_name),
  ]).slice(0, 5);

  return {
    key: canonicalPaperKey({
      doi: doi ?? undefined,
      url: url ?? undefined,
      locator: openalexId ?? undefined,
      title,
    }),
    title,
    snippet: abstract ? abstract.slice(0, 1200) : topics.length > 0 ? topics.join(", ") : null,
    doi,
    url,
    pdfUrl,
    hasPdf: Boolean(pdfUrl),
    authors: (work.authorships ?? [])
      .map((authorship) =>
        collapse(authorship.author?.display_name ?? authorship.raw_author_name ?? ""),
      )
      .filter(Boolean)
      .slice(0, 8),
    year: numberOrUndefined(work.publication_year) ?? null,
    publicationDate: work.publication_date ?? null,
    venue: collapse(location?.source?.display_name ?? "") || null,
    citedByCount: numberOrUndefined(work.cited_by_count) ?? null,
    isOpenAccess: Boolean(work.open_access?.is_oa),
    oaStatus: work.open_access?.oa_status ?? null,
    workType: work.type ?? null,
    language: work.language ?? null,
    isRetracted: Boolean(work.is_retracted),
    topics,
  };
}

/** Kolom `explore_papers` yang dibaca converter (baris Drizzle memenuhi bentuk ini). */
export type ExplorePaperCacheRow = {
  key: string;
  title: string;
  snippet: string | null;
  url: string | null;
  pdfUrl: string | null;
  doi: string | null;
  authors: string[];
  year: number | null;
  publicationDate: string | null;
  venue: string | null;
  citedByCount: number | null;
  isOpenAccess: boolean | null;
  oaStatus: string | null;
  workType: string | null;
  language: string | null;
  isRetracted: boolean;
  topics: string[];
};

/**
 * Paper → baris cache. `url` NOT NULL di `explore_papers`, jadi paper tanpa alamat jatuh ke DOI
 * lalu ke key — satu-satunya field yang tak identik bolak-balik, dan paper tanpa alamat mana pun
 * memang tak bisa dibuka reader.
 */
export function literaturePaperToExplorePaper(paper: LiteraturePaper): ExplorePaperInput {
  const openalexId = paper.key.startsWith("url:https://openalex.org/")
    ? paper.key.slice("url:".length)
    : undefined;
  return {
    key: paper.key,
    title: paper.title,
    snippet: paper.snippet,
    abstract: paper.snippet ?? undefined,
    url: paper.url ?? (paper.doi ? `https://doi.org/${paper.doi}` : paper.key),
    pdfUrl: paper.pdfUrl ?? undefined,
    doi: paper.doi ?? undefined,
    openalexId,
    provider: "OpenAlex",
    sourceLabel: paper.venue ?? "OpenAlex",
    authors: paper.authors,
    year: paper.year ?? undefined,
    publicationDate: paper.publicationDate ?? undefined,
    venue: paper.venue ?? undefined,
    citedByCount: paper.citedByCount ?? undefined,
    isOpenAccess: paper.isOpenAccess,
    oaStatus: paper.oaStatus ?? undefined,
    workType: paper.workType ?? undefined,
    language: paper.language ?? undefined,
    isRetracted: paper.isRetracted,
    topics: paper.topics,
  };
}

export function explorePaperToLiteraturePaper(row: ExplorePaperCacheRow): LiteraturePaper {
  return {
    key: row.key,
    title: row.title,
    snippet: row.snippet,
    doi: row.doi,
    url: row.url,
    pdfUrl: row.pdfUrl,
    hasPdf: Boolean(row.pdfUrl),
    authors: row.authors,
    year: row.year,
    publicationDate: row.publicationDate,
    venue: row.venue,
    citedByCount: row.citedByCount,
    isOpenAccess: Boolean(row.isOpenAccess),
    oaStatus: row.oaStatus,
    workType: row.workType,
    language: row.language,
    isRetracted: row.isRetracted,
    topics: row.topics,
  };
}
