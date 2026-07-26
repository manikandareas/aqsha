import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { encodeKeysetCursor, type KeysetCursor } from "../cursor";
import { type FeedItem, type NewFeedItem, feedItems } from "../schema/feedItems";
import type { DbOrTx } from "../types";

/**
 * Repo feed_items — query/index Drizzle + keyset cursor (TANPA business rule). Re-rank
 * For You/Top/Topics + filter hidden/kind/topic dilakukan di FeedService (post-fetch);
 * repo cuma mengembalikan page mentah by_order + nextCursor dari baris RAW terakhir.
 */
export const FeedRepo = {
  /**
   * Upsert by `dedupe_key`. On conflict update SEMUA field mutable kecuali `id`+`created_at`
   * (preserve baris asli yang dirujuk saved/hidden FK). Mengembalikan baris hasil.
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

  /** Provenance: apakah `url` benar-benar pdf_url salah satu feed item (guard pdf-proxy, anti-SSRF). */
  async pdfUrlExists(db: DbOrTx, url: string): Promise<boolean> {
    const rows = await db
      .select({ one: sql`1` })
      .from(feedItems)
      .where(eq(feedItems.pdfUrl, url))
      .limit(1);
    return rows.length > 0;
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
};
