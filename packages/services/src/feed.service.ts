/**
 * FeedService — read path discovery (P4). Port V1 `feed.getFeed`/`getFeedPaginated`/
 * `getFeedItem`. Framework-agnostic: re-rank For You/Top/Topics in-memory,
 * filter hidden/kind/topic post-fetch (page boleh menyusut, nextCursor tetap benar). Ownership
 * di-enforce caller (read feed = milik semua user; owner-scoped hanya hidden/saved/interest).
 */
import {
  type Db,
  decodeBalancedCursor,
  FeedInteractionRepo,
  type FeedItem,
  FeedRepo,
} from "@aqsha/db";
import { InterestService } from "./interest.service";
import {
  deClump,
  interestMatch,
  kindBoost,
  popularityScore,
  reasonFor,
  recencyScore,
} from "./feed/ranking";
import { type FeedItemResponse, type FeedKind, shapeFeedItem } from "./feed/model";
import {
  type DiscoveryTopicCategory,
  isDiscoveryTopicCategory,
  matchesTopicCategory,
} from "./feed/topicCategories";

const FEED_KINDS: FeedKind[] = ["paper", "news", "claim", "topic", "idea"];
const FEED_PAGE_LIMIT = 40;
const HIDDEN_CAP = 1_000;
const SAVED_CAP = 500;

export type FeedMode = "foryou" | "top" | "topics";

export const FeedService = {
  /**
   * Bento home feed (non-paginated): pool per-kind (best-trend ∪ recent) → re-rank interest +
   * recency + popularity + kindBoost → deClump → shape. Port V1 getFeed.
   */
  async getFeed(
    db: Db,
    ownerUserId: string,
    args: { limit?: number; kinds?: FeedKind[]; serendipity?: boolean },
  ): Promise<FeedItemResponse[]> {
    const limit = Math.min(args.limit ?? FEED_PAGE_LIMIT, 80);
    const requestedKinds = args.kinds && args.kinds.length > 0 ? args.kinds : FEED_KINDS;
    const pool = Math.min(limit * 3, 120);
    const now = Date.now();

    const perKind = await Promise.all(
      requestedKinds.map(async (kind) => {
        const [byTrend, byRecent] = await Promise.all([
          FeedRepo.listByKindTrend(db, kind, pool),
          FeedRepo.listByKindPublished(db, kind, pool),
        ]);
        return [...byTrend, ...byRecent];
      }),
    );
    const byId = new Map<string, FeedItem>();
    for (const item of perKind.flat()) byId.set(item.id, item);
    const candidates = [...byId.values()];

    const interests = await InterestService.loadWeights(db, ownerUserId);
    const hidden = new Set(await FeedInteractionRepo.hiddenItemIds(db, ownerUserId, HIDDEN_CAP));
    const saved = new Set(await FeedInteractionRepo.savedItemIds(db, ownerUserId, SAVED_CAP));

    const scored = candidates
      .filter((item) => !hidden.has(item.id))
      .map((item) => {
        const interest = interestMatch(item.topics, interests);
        const recency = recencyScore(item.publishedAt ?? item.lastSeenAt, now);
        const popularity = popularityScore(item.trendScore);
        const score = args.serendipity
          ? recency * 0.8 +
            popularity * 0.6 +
            (1 - Math.min(1, interest.normalized)) * 0.9 +
            kindBoost(item.kind) * 0.6
          : recency * 1.0 + popularity * 0.5 + interest.normalized * 1.5 + kindBoost(item.kind);
        return { item, score, interest };
      });
    scored.sort((a, b) => b.score - a.score);
    const ordered = deClump(scored, limit);

    return ordered.map(({ item, interest }) =>
      shapeFeedItem(item, {
        saved: saved.has(item.id),
        relevanceScore: Math.round(Math.min(1, interest.normalized) * 100),
        reason: reasonFor(item, interest, args.serendipity ?? false),
      }),
    );
  },

  /**
   * Paginated cross-kind feed (infinite scroll) — page BERIMBANG paper↔news (paginateBalanced,
   * dua lane keyset), lalu re-rank per-page + deClump (anti dua kind beruntun). mode top =
   * popularity-lean (no interest); foryou/topics = interest-aware; topics filter kategori.
   * Port V1 getFeedPaginated + fix bug "paper tak pernah muncul". `saved` di-omit.
   */
  async getFeedPaginated(
    db: Db,
    ownerUserId: string,
    args: {
      limit?: number;
      cursor?: string;
      mode?: FeedMode;
      kinds?: FeedKind[];
      topic?: string;
    },
  ): Promise<{ items: FeedItemResponse[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(args.limit ?? FEED_PAGE_LIMIT, 1), 40);
    const mode = args.mode ?? "foryou";
    const now = Date.now();
    const kindSet = args.kinds && args.kinds.length > 0 ? new Set(args.kinds) : null;
    const category: DiscoveryTopicCategory | null =
      mode === "topics" && args.topic && isDiscoveryTopicCategory(args.topic) ? args.topic : null;

    const page = await FeedRepo.paginateBalanced(db, {
      limit,
      cursor: decodeBalancedCursor(args.cursor),
    });

    const interests = await InterestService.loadWeights(db, ownerUserId);
    const hidden = new Set(await FeedInteractionRepo.hiddenItemIds(db, ownerUserId, HIDDEN_CAP));

    const scored = page.items
      .filter((item) => !hidden.has(item.id))
      .filter((item) => !kindSet || kindSet.has(item.kind as FeedKind))
      .filter((item) => !category || matchesTopicCategory(category, item.topics, item.title))
      .map((item) => {
        const interest = interestMatch(item.topics, interests);
        const recency = recencyScore(item.publishedAt ?? item.lastSeenAt, now);
        const popularity = popularityScore(item.trendScore);
        const score =
          mode === "top"
            ? popularity * 1.0 + recency * 0.6 + kindBoost(item.kind)
            : recency * 1.0 + popularity * 0.5 + interest.normalized * 1.5 + kindBoost(item.kind);
        return {
          item,
          score,
          shaped: shapeFeedItem(item, {
            relevanceScore: Math.round(Math.min(1, interest.normalized) * 100),
            reason: reasonFor(item, interest, false),
          }),
        };
      });
    scored.sort((a, b) => b.score - a.score);
    // deClump tanpa truncate (page sudah ≤ limit dari lane berimbang) → paper & news selang-seling.
    const ordered = deClump(scored, scored.length);

    return { items: ordered.map((s) => s.shaped), nextCursor: page.nextCursor };
  },

  /** Satu feed item + flag saved viewer. Port V1 getFeedItem. */
  async getFeedItem(
    db: Db,
    ownerUserId: string,
    id: string,
  ): Promise<FeedItemResponse | null> {
    const item = await FeedRepo.findById(db, id);
    if (!item) return null;
    const saved = await FeedInteractionRepo.findSaved(db, ownerUserId, id);
    return shapeFeedItem(item, { saved: Boolean(saved) });
  },

  /**
   * Related same-kind ("Discover more"): pool recent → rank topic-overlap lalu recency.
   * Port V1 getRelatedFeedItems. Exclude self + hidden.
   */
  async getRelatedFeedItems(
    db: Db,
    ownerUserId: string,
    id: string,
    limit?: number,
  ): Promise<FeedItemResponse[]> {
    const self = await FeedRepo.findById(db, id);
    if (!self) return [];
    const n = Math.min(Math.max(limit ?? 6, 1), 8);
    const pool = await FeedRepo.listByKindRecent(db, {
      kind: self.kind,
      excludeId: id,
      limit: n * 4,
    });
    const hidden = new Set(await FeedInteractionRepo.hiddenItemIds(db, ownerUserId, HIDDEN_CAP));
    const saved = new Set(await FeedInteractionRepo.savedItemIds(db, ownerUserId, SAVED_CAP));
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
      .map((entry) => shapeFeedItem(entry.row, { saved: saved.has(entry.row.id) }));
  },
};
