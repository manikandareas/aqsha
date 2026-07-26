/**
 * Model domain feed — leaf murni (tanpa DB/Elysia/BullMQ) supaya funnel write
 * (`buildFeedItemRow`) berperilaku identik di lane worker maupun di materialisasi save.
 *
 * INVARIAN: `deriveOrderAt` HARUS jalan di SETIAP write feed (`buildFeedItemRow` adalah
 * satu-satunya konstruktor row) supaya keyset infinite-scroll punya urutan total.
 */
import type { NewFeedItem } from "@aqsha/db";
import type { LiteraturePaper } from "../papers/work";

/** Paper feed di kabel: bentuk hasil pencarian, plus pegangan untuk hide/save. */
export type FeedPaper = LiteraturePaper & { feedItemId: string };

/**
 * Kunci sort kronologis NON-optional untuk by_order: `publishedAt ?? lastSeenAt ?? createdAt`.
 * Dengan `lastSeenAt`/`createdAt` default `now`, paper tanpa tanggal terbit tetap punya urutan.
 */
export function deriveOrderAt(item: {
  publishedAt?: number;
  lastSeenAt: number;
  createdAt: number;
}): number {
  return item.publishedAt ?? item.lastSeenAt ?? item.createdAt;
}

/** Tanggal terbit OpenAlex (ISO) → epoch ms untuk kolom sort. Tanggal tak terbaca → undefined. */
export function parsePublishedAt(publicationDate: string | null): number | undefined {
  if (!publicationDate) return undefined;
  const ms = Date.parse(publicationDate);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Satu-satunya konstruktor row feed_items. Mint `id`, set `createdAt`/`lastSeenAt`, dan turunkan
 * `dedupeKey`/`publishedAt`/`orderAt`/`trendScore`. Semua jalur write WAJIB lewat sini.
 */
export function buildFeedItemRow(paper: LiteraturePaper, now: number): NewFeedItem {
  const publishedAt = parsePublishedAt(paper.publicationDate);
  const orderAt = deriveOrderAt({ publishedAt, lastSeenAt: now, createdAt: now });
  return {
    id: crypto.randomUUID(),
    kind: "paper",
    key: paper.key,
    title: paper.title,
    snippet: paper.snippet,
    doi: paper.doi,
    url: paper.url,
    pdfUrl: paper.pdfUrl,
    hasPdf: paper.hasPdf,
    authors: paper.authors,
    year: paper.year,
    publicationDate: paper.publicationDate,
    venue: paper.venue,
    citedByCount: paper.citedByCount,
    isOpenAccess: paper.isOpenAccess,
    oaStatus: paper.oaStatus,
    workType: paper.workType,
    language: paper.language,
    isRetracted: paper.isRetracted,
    topics: paper.topics,
    trendScore: paper.citedByCount ?? 0,
    publishedAt,
    dedupeKey: `paper:${paper.key}`,
    lastSeenAt: now,
    createdAt: now,
    orderAt,
  };
}

/** Baris feed_items sebagaimana dibaca Drizzle (subset yang dipakai shaping). */
export type FeedItemRow = {
  id: string;
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

/** Proyeksi row → paper di kabel: buang header mesin, sisakan bentuk hasil pencarian. */
export function shapeFeedItem(row: FeedItemRow): FeedPaper {
  return {
    feedItemId: row.id,
    key: row.key,
    title: row.title,
    snippet: row.snippet,
    doi: row.doi,
    url: row.url,
    pdfUrl: row.pdfUrl,
    hasPdf: row.hasPdf,
    authors: row.authors,
    year: row.year,
    publicationDate: row.publicationDate,
    venue: row.venue,
    citedByCount: row.citedByCount,
    isOpenAccess: row.isOpenAccess,
    oaStatus: row.oaStatus,
    workType: row.workType,
    language: row.language,
    isRetracted: row.isRetracted,
    topics: row.topics,
  };
}
