/**
 * FeedService — read path discovery. Framework-agnostic: re-rank For You/Top/Topics in-memory,
 * filter hidden/topic post-fetch (page boleh menyusut, nextCursor tetap benar). Ownership
 * di-enforce caller (read feed = milik semua user; owner-scoped hanya hidden/saved/interest).
 */
import {
  type Db,
  decodeKeysetCursor,
  FeedInteractionRepo,
  type FeedItem,
  FeedRepo,
} from "@aqsha/db";
import { InterestService } from "./interest.service";
import { interestMatch, popularityScore, recencyScore } from "./feed/ranking";
import { type FeedPaper, shapeFeedItem } from "./feed/model";
import {
  type DiscoveryTopicCategory,
  isDiscoveryTopicCategory,
  matchesTopicCategory,
} from "./feed/topicCategories";

const FEED_PAGE_LIMIT = 40;
const HIDDEN_CAP = 1_000;

export type FeedMode = "foryou" | "top" | "topics";

export const FeedService = {
  /**
   * Bento home feed (non-paginated): pool best-trend ∪ recent → re-rank interest + recency +
   * popularity → shape.
   */
  async getFeed(
    db: Db,
    ownerUserId: string,
    args: { limit?: number; serendipity?: boolean },
  ): Promise<FeedPaper[]> {
    const limit = Math.min(args.limit ?? FEED_PAGE_LIMIT, 80);
    const pool = Math.min(limit * 3, 120);
    const now = Date.now();

    const [byTrend, byRecent] = await Promise.all([
      FeedRepo.listByKindTrend(db, "paper", pool),
      FeedRepo.listByKindPublished(db, "paper", pool),
    ]);
    const byId = new Map<string, FeedItem>();
    for (const item of [...byTrend, ...byRecent]) byId.set(item.id, item);

    const interests = await InterestService.loadWeights(db, ownerUserId);
    const hidden = new Set(await FeedInteractionRepo.hiddenItemIds(db, ownerUserId, HIDDEN_CAP));

    const scored = [...byId.values()]
      .filter((item) => !hidden.has(item.id))
      .map((item) => {
        const interest = interestMatch(item.topics, interests);
        const recency = recencyScore(item.publishedAt ?? item.lastSeenAt, now);
        const popularity = popularityScore(item.trendScore);
        const score = args.serendipity
          ? recency * 0.8 + popularity * 0.6 + (1 - Math.min(1, interest.normalized)) * 0.9
          : recency * 1.0 + popularity * 0.5 + interest.normalized * 1.5;
        return { item, score };
      });
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(({ item }) => shapeFeedItem(item));
  },

  /**
   * Paginated feed (infinite scroll) — keyset `(order_at, id)` DESC lalu re-rank per-page.
   * mode top = popularity-lean (no interest); foryou/topics = interest-aware; topics filter
   * kategori. `nextCursor` datang dari baris RAW terakhir, jadi tetap benar walau page menyusut.
   */
  async getFeedPaginated(
    db: Db,
    ownerUserId: string,
    args: { limit?: number; cursor?: string; mode?: FeedMode; topic?: string },
  ): Promise<{ items: FeedPaper[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(args.limit ?? FEED_PAGE_LIMIT, 1), 40);
    const mode = args.mode ?? "foryou";
    const now = Date.now();
    const category: DiscoveryTopicCategory | null =
      mode === "topics" && args.topic && isDiscoveryTopicCategory(args.topic) ? args.topic : null;

    const page = await FeedRepo.paginateByOrder(db, {
      limit,
      cursor: decodeKeysetCursor(args.cursor),
    });

    const interests = await InterestService.loadWeights(db, ownerUserId);
    const hidden = new Set(await FeedInteractionRepo.hiddenItemIds(db, ownerUserId, HIDDEN_CAP));

    const scored = page.items
      .filter((item) => !hidden.has(item.id))
      .filter((item) => !category || matchesTopicCategory(category, item.topics, item.title))
      .map((item) => {
        const interest = interestMatch(item.topics, interests);
        const recency = recencyScore(item.publishedAt ?? item.lastSeenAt, now);
        const popularity = popularityScore(item.trendScore);
        const score =
          mode === "top"
            ? popularity * 1.0 + recency * 0.6
            : recency * 1.0 + popularity * 0.5 + interest.normalized * 1.5;
        return { item, score };
      });
    scored.sort((a, b) => b.score - a.score);

    return { items: scored.map(({ item }) => shapeFeedItem(item)), nextCursor: page.nextCursor };
  },

  async getFeedItem(db: Db, _ownerUserId: string, id: string): Promise<FeedPaper | null> {
    const item = await FeedRepo.findById(db, id);
    return item ? shapeFeedItem(item) : null;
  },

  /** Related ("Discover more"): pool recent → rank topic-overlap lalu recency. Exclude self + hidden. */
  async getRelatedFeedItems(
    db: Db,
    ownerUserId: string,
    id: string,
    limit?: number,
  ): Promise<FeedPaper[]> {
    const self = await FeedRepo.findById(db, id);
    if (!self) return [];
    const n = Math.min(Math.max(limit ?? 6, 1), 8);
    const pool = await FeedRepo.listByKindRecent(db, {
      kind: "paper",
      excludeId: id,
      limit: n * 4,
    });
    const hidden = new Set(await FeedInteractionRepo.hiddenItemIds(db, ownerUserId, HIDDEN_CAP));
    const selfTopics = new Set(self.topics.map((t) => t.trim().toLowerCase()));
    return pool
      .filter((row) => !hidden.has(row.id))
      .map((row) => ({
        row,
        overlap: row.topics.reduce(
          (count, t) => count + (selfTopics.has(t.trim().toLowerCase()) ? 1 : 0),
          0,
        ),
        recency: row.publishedAt ?? row.lastSeenAt,
      }))
      .sort((a, b) => b.overlap - a.overlap || b.recency - a.recency)
      .slice(0, n)
      .map((entry) => shapeFeedItem(entry.row));
  },
};
