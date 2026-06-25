/**
 * PaperCacheService — cache paper bersama `explore_papers` (P4). Port V1 `explore.upsertPaperCache`
 * + `getPaper` + `feed.papersByKeys`. Satu rumah baca/tulis cache; dirujuk feed materialize,
 * explore search, getOrFetchPaper, evidence drawer.
 */
import { type Db, type DbOrTx, PaperCacheRepo } from "@aqsha/db";
import {
  type ExplorePaperDetail,
  type ExplorePaperInput,
  explorePaperToRow,
} from "./explore/model";

export type PapersByKeysItem = {
  key: string;
  title: string;
  year?: number;
  url: string;
  citedByCount?: number;
  isOpenAccess?: boolean;
};

function toDetail(row: {
  key: string;
  title: string;
  snippet: string;
  abstract: string | null;
  url: string;
  pdfUrl: string | null;
  doi: string | null;
  arxivId: string | null;
  openalexId: string | null;
  provider: string;
  sourceLabel: string;
  authors: string[];
  year: number | null;
  publicationDate: string | null;
  venue: string | null;
  citedByCount: number | null;
  isOpenAccess: boolean | null;
  topics: string[];
  score: number | null;
  lastSeenAt: number;
}): ExplorePaperDetail {
  const o = <T>(v: T | null): T | undefined => (v === null ? undefined : v);
  return {
    key: row.key,
    title: row.title,
    snippet: row.snippet,
    abstract: o(row.abstract),
    url: row.url,
    pdfUrl: o(row.pdfUrl),
    doi: o(row.doi),
    arxivId: o(row.arxivId),
    openalexId: o(row.openalexId),
    provider: row.provider as ExplorePaperDetail["provider"],
    sourceLabel: row.sourceLabel,
    authors: row.authors,
    year: o(row.year),
    publicationDate: o(row.publicationDate),
    venue: o(row.venue),
    citedByCount: o(row.citedByCount),
    isOpenAccess: o(row.isOpenAccess),
    topics: row.topics,
    score: o(row.score),
    lastSeenAt: row.lastSeenAt,
  };
}

export const PaperCacheService = {
  /** Upsert banyak paper ke cache (replace-by-key + bump lastSeenAt). */
  async upsert(db: DbOrTx, papers: ExplorePaperInput[], lastSeenAt: number): Promise<void> {
    if (papers.length === 0) return;
    await PaperCacheRepo.upsertMany(db, papers.map((p) => explorePaperToRow(p, lastSeenAt)));
  },

  /** Baca paper by key (pure cache, no network). Port V1 explore.getPaper. */
  async getByKey(db: Db, key: string): Promise<ExplorePaperDetail | null> {
    const row = await PaperCacheRepo.getByKey(db, key);
    return row ? toDetail(row) : null;
  },

  /** Resolve banyak paper (evidence drawer). Port V1 feed.papersByKeys (cap 12). */
  async papersByKeys(db: Db, keys: string[]): Promise<PapersByKeysItem[]> {
    const rows = await PaperCacheRepo.findByKeys(db, keys.slice(0, 12));
    return rows.map((p) => ({
      key: p.key,
      title: p.title,
      year: p.year ?? undefined,
      url: p.url,
      citedByCount: p.citedByCount ?? undefined,
      isOpenAccess: p.isOpenAccess ?? undefined,
    }));
  },
};
