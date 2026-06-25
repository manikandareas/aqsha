import { and, desc, eq, inArray } from "drizzle-orm";
import { type FeedItem, feedItems } from "../schema/feedItems";
import { type NewSavedFeedItem, type SavedFeedItem, savedFeedItems } from "../schema/savedFeedItems";
import { type HiddenFeedItem, type NewHiddenFeedItem, hiddenFeedItems } from "../schema/hiddenFeedItems";
import { type FeedInteraction, type NewFeedInteraction, feedInteractions } from "../schema/feedInteractions";
import type { DbOrTx } from "../types";

/** Ref discovery (feed-id + paper-key) yang di-resolve dari saved/hidden rows. */
export type DiscoveryRefRow = { feedItemId: string; paperKey: string | null };

/**
 * Repo saved/hidden/interactions feed — persistence + lookup ref (TANPA business rule;
 * interest bump + materialisasi paper hidup di FeedInteractionService).
 */
export const FeedInteractionRepo = {
  // ── saved ──────────────────────────────────────────────────────────────
  async insertSaved(db: DbOrTx, row: NewSavedFeedItem): Promise<void> {
    await db.insert(savedFeedItems).values(row).onConflictDoNothing({
      target: [savedFeedItems.ownerUserId, savedFeedItems.feedItemId],
    });
  },

  async findSaved(db: DbOrTx, ownerUserId: string, feedItemId: string): Promise<SavedFeedItem | null> {
    const rows = await db
      .select()
      .from(savedFeedItems)
      .where(and(eq(savedFeedItems.ownerUserId, ownerUserId), eq(savedFeedItems.feedItemId, feedItemId)))
      .limit(1);
    return rows[0] ?? null;
  },

  async deleteSaved(db: DbOrTx, ownerUserId: string, feedItemId: string): Promise<void> {
    await db
      .delete(savedFeedItems)
      .where(and(eq(savedFeedItems.ownerUserId, ownerUserId), eq(savedFeedItems.feedItemId, feedItemId)));
  },

  /** Daftar saved (terbaru) join feed_items untuk koleksi sidebar (savedAt + row). */
  async listSavedItems(
    db: DbOrTx,
    ownerUserId: string,
    limit: number,
  ): Promise<Array<{ savedAt: number; item: FeedItem }>> {
    const rows = await db
      .select({ savedAt: savedFeedItems.createdAt, item: feedItems })
      .from(savedFeedItems)
      .innerJoin(feedItems, eq(savedFeedItems.feedItemId, feedItems.id))
      .where(eq(savedFeedItems.ownerUserId, ownerUserId))
      .orderBy(desc(savedFeedItems.createdAt))
      .limit(limit);
    return rows;
  },

  // ── hidden ─────────────────────────────────────────────────────────────
  async insertHidden(db: DbOrTx, row: NewHiddenFeedItem): Promise<void> {
    await db.insert(hiddenFeedItems).values(row).onConflictDoNothing({
      target: [hiddenFeedItems.ownerUserId, hiddenFeedItems.feedItemId],
    });
  },

  async findHidden(db: DbOrTx, ownerUserId: string, feedItemId: string): Promise<HiddenFeedItem | null> {
    const rows = await db
      .select()
      .from(hiddenFeedItems)
      .where(and(eq(hiddenFeedItems.ownerUserId, ownerUserId), eq(hiddenFeedItems.feedItemId, feedItemId)))
      .limit(1);
    return rows[0] ?? null;
  },

  /** Set id feed yang di-hide owner (filter feed/search read-time). */
  async hiddenItemIds(db: DbOrTx, ownerUserId: string, limit: number): Promise<string[]> {
    const rows = await db
      .select({ feedItemId: hiddenFeedItems.feedItemId })
      .from(hiddenFeedItems)
      .where(eq(hiddenFeedItems.ownerUserId, ownerUserId))
      .orderBy(desc(hiddenFeedItems.createdAt))
      .limit(limit);
    return rows.map((r) => r.feedItemId);
  },

  /** Set id feed yang di-save owner (flag `saved` di getFeed bento). */
  async savedItemIds(db: DbOrTx, ownerUserId: string, limit: number): Promise<string[]> {
    const rows = await db
      .select({ feedItemId: savedFeedItems.feedItemId })
      .from(savedFeedItems)
      .where(eq(savedFeedItems.ownerUserId, ownerUserId))
      .orderBy(desc(savedFeedItems.createdAt))
      .limit(limit);
    return rows.map((r) => r.feedItemId);
  },

  // ── interactions ─────────────────────────────────────────────────────────
  async insertInteraction(db: DbOrTx, row: NewFeedInteraction): Promise<void> {
    await db.insert(feedInteractions).values(row);
  },

  // ── refs (saved/hidden discovery) ─────────────────────────────────────────
  /**
   * Resolve ref discovery dari saved rows — tiap row mengembalikan feed_item_id + paper_key
   * (lewat join feed_items). `feedItemIds=null` → set terbaru (limit); else probe spesifik.
   */
  async savedRefs(
    db: DbOrTx,
    ownerUserId: string,
    feedItemIds: string[] | null,
    limit: number,
  ): Promise<DiscoveryRefRow[]> {
    const base = and(
      eq(savedFeedItems.ownerUserId, ownerUserId),
      ...(feedItemIds ? [inArray(savedFeedItems.feedItemId, feedItemIds)] : []),
    );
    const rows = await db
      .select({ feedItemId: savedFeedItems.feedItemId, paperKey: feedItems.paperKey })
      .from(savedFeedItems)
      .innerJoin(feedItems, eq(savedFeedItems.feedItemId, feedItems.id))
      .where(base)
      .orderBy(desc(savedFeedItems.createdAt))
      .limit(limit);
    return rows;
  },

  async hiddenRefs(
    db: DbOrTx,
    ownerUserId: string,
    feedItemIds: string[] | null,
    limit: number,
  ): Promise<DiscoveryRefRow[]> {
    const base = and(
      eq(hiddenFeedItems.ownerUserId, ownerUserId),
      ...(feedItemIds ? [inArray(hiddenFeedItems.feedItemId, feedItemIds)] : []),
    );
    const rows = await db
      .select({ feedItemId: hiddenFeedItems.feedItemId, paperKey: feedItems.paperKey })
      .from(hiddenFeedItems)
      .innerJoin(feedItems, eq(hiddenFeedItems.feedItemId, feedItems.id))
      .where(base)
      .orderBy(desc(hiddenFeedItems.createdAt))
      .limit(limit);
    return rows;
  },
};
