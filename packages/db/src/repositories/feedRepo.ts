import { and, desc, eq, getTableColumns, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import {
  type BalancedCursor,
  encodeBalancedCursor,
  encodeKeysetCursor,
  encodeSearchCursor,
  type KeysetCursor,
  type LaneCursor,
  type SearchKeysetCursor,
} from "../cursor";
import { type FeedItem, type NewFeedItem, feedItems } from "../schema/feedItems";
import type { DbOrTx } from "../types";

/** Baris news yang butuh enrichment (body/url belum ada) + field untuk hitung patch di service. */
export type NewsEnrichmentTarget = {
  id: string;
  url: string;
  title: string;
  summary: string;
  topics: string[];
  imageUrl: string | null;
  tldr: string | null;
  enrichAttempts: number | null;
};

/** Patch enrichment yang sudah dihitung service (guard "jangan overwrite" + searchText di service). */
export type EnrichmentPatch = {
  enrichAttempts: number;
  resolvedUrl?: string;
  articleText?: string;
  imageUrl?: string;
  summary?: string;
  tldr?: string;
  searchText?: string;
};

/**
 * Repo feed_items — query/index Drizzle + keyset cursor (TANPA business rule). Re-rank
 * For You/Top/Topics + filter hidden/kind/topic dilakukan di FeedService (post-fetch);
 * repo cuma mengembalikan page mentah by_order + nextCursor dari baris RAW terakhir.
 */
export const FeedRepo = {
  /**
   * Upsert by `dedupe_key` (port V1 upsertFeedItems). On conflict update SEMUA field mutable
   * kecuali `id`+`created_at` (preserve baris asli yang dirujuk saved/hidden FK). `search_tsv`
   * GENERATED — tak di-set. Mengembalikan baris hasil (inserted/updated).
   */
  async upsertByDedupeKey(db: DbOrTx, row: NewFeedItem): Promise<FeedItem> {
    const { id: _id, createdAt: _createdAt, ...mutable } = row;
    const rows = await db
      .insert(feedItems)
      .values(row)
      .onConflictDoUpdate({ target: feedItems.dedupeKey, set: mutable })
      .returning();
    return rows[0]!;
  },

  async findById(db: DbOrTx, id: string): Promise<FeedItem | null> {
    const rows = await db.select().from(feedItems).where(eq(feedItems.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async findByDedupeKey(db: DbOrTx, dedupeKey: string): Promise<FeedItem | null> {
    const rows = await db
      .select()
      .from(feedItems)
      .where(eq(feedItems.dedupeKey, dedupeKey))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Baris feed paper yang sudah ter-materialisasi untuk sebuah paper_key (ensureFeedItemForPaperKey). */
  async findByPaperKey(db: DbOrTx, paperKey: string): Promise<FeedItem | null> {
    const rows = await db
      .select()
      .from(feedItems)
      .where(eq(feedItems.paperKey, paperKey))
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * Page keyset by `(order_at, id)` DESC (getFeedPaginated). `nextCursor` dari baris RAW
   * terakhir (bukan setelah filter) supaya loop infinite-scroll konsisten walau page menyusut
   * pasca filter hidden/kind/topic di service.
   */
  async paginateByOrder(
    db: DbOrTx,
    args: { limit: number; cursor: KeysetCursor | null },
  ): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
    const keyset = args.cursor
      ? or(
          lt(feedItems.orderAt, args.cursor.u),
          and(eq(feedItems.orderAt, args.cursor.u), lt(feedItems.id, args.cursor.i)),
        )
      : undefined;
    const rows = await db
      .select()
      .from(feedItems)
      .where(keyset)
      .orderBy(desc(feedItems.orderAt), desc(feedItems.id))
      .limit(args.limit + 1);
    const hasMore = rows.length > args.limit;
    const items = hasMore ? rows.slice(0, args.limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? encodeKeysetCursor({ u: last.orderAt, i: last.id }) : null;
    return { items, nextCursor };
  },

  /**
   * Page feed BERIMBANG paper↔news (getFeedPaginated). Dua lane keyset `(order_at, id)` DESC
   * TERPISAH — lane paper (`kind='paper'`) & lane non-paper — lalu interleave kuota ~50/50.
   * Fix bug "paper tak pernah muncul": single keyset by_order lama selalu kebanjiran news
   * (orderAt≈now, refresh tiap 20m) → paper (publication date lama) tak masuk window. Lane
   * terpisah menjamin paper ikut ter-fetch. Cursor komposit (lihat BalancedCursor): per-lane
   * lanjut/`"end"`/mulai, supaya lane habis tak ke-restart.
   */
  async paginateBalanced(
    db: DbOrTx,
    args: { limit: number; cursor: BalancedCursor | null },
  ): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
    const limit = Math.max(args.limit, 1);
    const fetchN = limit + 1; // +1 → deteksi "masih ada lagi" per lane
    const pc = args.cursor?.p ?? null;
    const nc = args.cursor?.n ?? null;

    const [paperRows, newsRows] = await Promise.all([
      pc === "end" ? Promise.resolve<FeedItem[]>([]) : laneByOrder(db, "paper", pc, fetchN),
      nc === "end" ? Promise.resolve<FeedItem[]>([]) : laneByOrder(db, "nonpaper", nc, fetchN),
    ]);

    const paperMore = paperRows.length > limit;
    const newsMore = newsRows.length > limit;
    const papers = paperMore ? paperRows.slice(0, limit) : paperRows;
    const news = newsMore ? newsRows.slice(0, limit) : newsRows;

    const { items, consumedPaper, consumedNews } = mergeBalancedLanes(papers, news, limit);

    const pNext = laneNext(consumedPaper, papers, paperMore, pc);
    const nNext = laneNext(consumedNews, news, newsMore, nc);
    const nextCursor =
      pNext === "end" && nNext === "end"
        ? null
        : encodeBalancedCursor({ p: pNext, n: nNext });

    return { items, nextCursor };
  },

  /** Top-N by trend untuk satu kind (pool bento getFeed). */
  async listByKindTrend(db: DbOrTx, kind: string, limit: number): Promise<FeedItem[]> {
    return db
      .select()
      .from(feedItems)
      .where(eq(feedItems.kind, kind))
      .orderBy(desc(feedItems.trendScore))
      .limit(limit);
  },

  /** Top-N by published untuk satu kind (pool bento getFeed). NULLS LAST. */
  async listByKindPublished(db: DbOrTx, kind: string, limit: number): Promise<FeedItem[]> {
    return db
      .select()
      .from(feedItems)
      .where(eq(feedItems.kind, kind))
      .orderBy(sql`${feedItems.publishedAt} desc nulls last`)
      .limit(limit);
  },

  /**
   * Item news Google yang masih butuh enrichment: provider google_news, article_text NULL,
   * enrich_attempts < MAX (2). Port V1 googleNewsItemsNeedingEnrichment. NULLS LAST by published.
   */
  async listNewsNeedingEnrichment(
    db: DbOrTx,
    limit: number,
  ): Promise<NewsEnrichmentTarget[]> {
    const rows = await db
      .select({
        id: feedItems.id,
        url: feedItems.url,
        title: feedItems.title,
        summary: feedItems.summary,
        topics: feedItems.topics,
        imageUrl: feedItems.imageUrl,
        tldr: feedItems.tldr,
        enrichAttempts: feedItems.enrichAttempts,
      })
      .from(feedItems)
      .where(
        and(
          eq(feedItems.kind, "news"),
          eq(feedItems.provider, "google_news"),
          isNull(feedItems.articleText),
          or(isNull(feedItems.enrichAttempts), lt(feedItems.enrichAttempts, 2)),
        ),
      )
      .orderBy(sql`${feedItems.publishedAt} desc nulls last`)
      .limit(limit);
    return rows;
  },

  /** Terapkan patch enrichment (set sudah dihitung service). Dumb update by id. */
  async applyEnrichmentPatch(db: DbOrTx, id: string, patch: EnrichmentPatch): Promise<void> {
    await db.update(feedItems).set(patch).where(eq(feedItems.id, id));
  },

  /**
   * Kandidat related same-kind (di-rank topic-overlap di service). Exclude self. Pool diurut
   * by `published_at` DESC NULLS LAST (port V1 `by_kind_published`) — bukan orderAt — supaya
   * kandidat = paling baru terbit untuk kind itu.
   */
  async listByKindRecent(
    db: DbOrTx,
    args: { kind: string; excludeId: string; limit: number },
  ): Promise<FeedItem[]> {
    return db
      .select()
      .from(feedItems)
      .where(and(eq(feedItems.kind, args.kind), sql`${feedItems.id} <> ${args.excludeId}`))
      .orderBy(sql`${feedItems.publishedAt} desc nulls last`, desc(feedItems.id))
      .limit(args.limit);
  },

  /**
   * Full-text search (search_tsv GIN, websearch_to_tsquery 'simple') + filter kind/fromYear,
   * di-rank `ts_rank` DESC (port relevance-order V1 Convex withSearchIndex) lalu tiebreaker
   * kronologis `(order_at, id)`. Keyset cursor `(rank, order_at, id)` (searchDiscovery, Slice 4.6).
   */
  async searchByTsvector(
    db: DbOrTx,
    args: {
      q: string;
      kinds: string[] | null;
      fromYear: number | null;
      limit: number;
      cursor: SearchKeysetCursor | null;
    },
  ): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
    const tsq = sql`websearch_to_tsquery('simple', ${args.q})`;
    const rank = sql<number>`ts_rank(${feedItems.searchTsv}, ${tsq})`;
    const conds = [sql`${feedItems.searchTsv} @@ ${tsq}`];
    if (args.kinds && args.kinds.length > 0) conds.push(inArray(feedItems.kind, args.kinds));
    if (args.fromYear != null) {
      conds.push(gte(feedItems.publishedAt, Date.UTC(args.fromYear, 0, 1)));
    }
    if (args.cursor) {
      const c = args.cursor;
      conds.push(
        sql`(${rank} < ${c.r} or (${rank} = ${c.r} and (${feedItems.orderAt} < ${c.u} or (${feedItems.orderAt} = ${c.u} and ${feedItems.id} < ${c.i}))))`,
      );
    }
    const rows = await db
      .select({ ...getTableColumns(feedItems), _rank: rank })
      .from(feedItems)
      .where(and(...conds))
      .orderBy(desc(rank), desc(feedItems.orderAt), desc(feedItems.id))
      .limit(args.limit + 1);
    const hasMore = rows.length > args.limit;
    const page = hasMore ? rows.slice(0, args.limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeSearchCursor({ r: last._rank, u: last.orderAt, i: last.id })
        : null;
    const items: FeedItem[] = page.map(({ _rank, ...row }) => row);
    return { items, nextCursor };
  },
};

/**
 * Interleave dua lane pre-sorted jadi maksimal `limit` item, kuota ~50/50, backfill dari
 * lane lain bila satu kosong. PURE (unit-tested tanpa DB). Alternasi: ambil paper saat
 * `pi <= ni` (paper duluan), else news. Kembalikan jumlah DIKONSUMSI per lane (untuk cursor).
 */
export function mergeBalancedLanes<T>(
  papers: T[],
  news: T[],
  limit: number,
): { items: T[]; consumedPaper: number; consumedNews: number } {
  const items: T[] = [];
  let pi = 0;
  let ni = 0;
  while (items.length < limit && (pi < papers.length || ni < news.length)) {
    const takePaper = pi < papers.length && (ni >= news.length || pi <= ni);
    if (takePaper) {
      items.push(papers[pi]!);
      pi += 1;
    } else {
      items.push(news[ni]!);
      ni += 1;
    }
  }
  return { items, consumedPaper: pi, consumedNews: ni };
}

/** Satu lane keyset `(order_at, id)` DESC, filter kind paper / non-paper. */
function laneByOrder(
  db: DbOrTx,
  lane: "paper" | "nonpaper",
  cursor: KeysetCursor | null,
  limit: number,
): Promise<FeedItem[]> {
  const kindCond =
    lane === "paper" ? eq(feedItems.kind, "paper") : ne(feedItems.kind, "paper");
  const keyset = cursor
    ? or(
        lt(feedItems.orderAt, cursor.u),
        and(eq(feedItems.orderAt, cursor.u), lt(feedItems.id, cursor.i)),
      )
    : undefined;
  return db
    .select()
    .from(feedItems)
    .where(keyset ? and(kindCond, keyset) : kindCond)
    .orderBy(desc(feedItems.orderAt), desc(feedItems.id))
    .limit(limit);
}

/**
 * Posisi lanjut sebuah lane: `"end"` (habis), keyset baris terakhir dikonsumsi, atau `prev`
 * (lane belum maju — slot terisi penuh oleh lane lain; `null` = mulai dari atas lagi).
 */
function laneNext(
  consumed: number,
  rows: FeedItem[],
  more: boolean,
  prev: LaneCursor | null,
): LaneCursor | null {
  if (rows.length === 0) return "end";
  const hasMore = consumed < rows.length || more;
  if (!hasMore) return "end";
  if (consumed === 0) return prev;
  const last = rows[consumed - 1]!;
  return { u: last.orderAt, i: last.id };
}
