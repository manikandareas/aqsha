import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireCurrentUser } from "./auth";
import { feedItemValidator, feedItemKindValidator } from "./feed/validators";
import { candidatesToExplorePapers, type ExplorePaper } from "./explore/model";
import {
  fetchOpenAlexWorksService,
  workIdentifiers,
  normalizeDoiLoose,
} from "./feed/openAlex";
import type { DiscoveryItemRef } from "./feed/model";
import { deriveOrderAt } from "./feed/model";
import { normalizeInterestTopic } from "./feed/interestKeywords";

const TRENDING_LIMIT = 24;
const FEED_PAGE_LIMIT = 40;
const RECENCY_HALF_LIFE_DAYS = 21;
const DAY_MS = 1000 * 60 * 60 * 24;

const FEED_KINDS = ["paper", "news", "claim", "topic", "idea"] as const;
type DiscoveryResolvedRef =
  | { kind: "feed"; feedItemId: Doc<"feedItems">["_id"] }
  | { kind: "paper"; paperKey: string };

const discoveryItemRefValidator = v.union(
  v.object({
    kind: v.literal("feed"),
    feedItemId: v.string(),
  }),
  v.object({
    kind: v.literal("paper"),
    paperKey: v.string(),
  }),
);

// Shape a raw feedItems doc into the public FeedItem the frontend consumes:
// strip the system `_creationTime` and surface the denormalized verdict as
// `claim`. Shared by getFeed / getFeedItem / getRelatedFeedItems so every read
// path returns an identically-shaped item.
function shapeFeedItem(item: Doc<"feedItems">, options?: { saved?: boolean }) {
  const { _creationTime, ...rest } = item;
  void _creationTime;
  return { ...rest, claim: item.primaryClaim, saved: Boolean(options?.saved) };
}

// ── Public: read the ranked, mixed-media feed ─────────────────────────────
// Ranks across lanes with a recency + popularity + interest composite, joins
// fact-check verdicts onto claim items, and annotates each item with a
// per-user relevance score + a specific "why am I seeing this" reason.
export const getFeed = query({
  args: {
    limit: v.optional(v.number()),
    kinds: v.optional(v.array(feedItemKindValidator)),
    // Serendipity toggle: surface novel-but-adjacent items (low interest
    // overlap, high topic distance) instead of the usual best-match ranking.
    serendipity: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const limit = Math.min(args.limit ?? FEED_PAGE_LIMIT, 80);
    const requestedKinds = args.kinds ?? [...FEED_KINDS];
    const pool = Math.min(limit * 3, 120);
    const now = Date.now();

    // Per-kind candidate pool (best-by-trend ∪ most-recent), deduped by id.
    const perKind = await Promise.all(
      requestedKinds.map(async (kind) => {
        const [byTrend, byRecent] = await Promise.all([
          ctx.db
            .query("feedItems")
            .withIndex("by_kind_trend", (q) => q.eq("kind", kind))
            .order("desc")
            .take(pool),
          ctx.db
            .query("feedItems")
            .withIndex("by_kind_published", (q) => q.eq("kind", kind))
            .order("desc")
            .take(pool),
        ]);
        return [...byTrend, ...byRecent];
      }),
    );
    const byId = new Map<string, Doc<"feedItems">>();
    for (const item of perKind.flat()) {
      byId.set(item._id, item);
    }
    const candidates = [...byId.values()];

    // User signals: interests (signed weights) + hidden items.
    const interests = await loadInterestWeights(ctx, user._id);
    const hidden = await loadHiddenItemIds(ctx, user._id);
    const saved = await loadSavedItemIds(ctx, user._id);

    const scored = candidates
      .filter((item) => !hidden.has(item._id))
      .map((item) => {
        const interest = interestMatch(item.topics, interests);
        const recency = recencyScore(item.publishedAt ?? item.lastSeenAt, now);
        const popularity = popularityScore(item.trendScore);
        const score = args.serendipity
          ? recency * 0.8 +
            popularity * 0.6 +
            // reward distance from the user's existing interests
            (1 - Math.min(1, interest.normalized)) * 0.9 +
            kindBoost(item.kind) * 0.6
          : recency * 1.0 +
            popularity * 0.5 +
            interest.normalized * 1.5 +
            kindBoost(item.kind);
        return { item, score, interest };
      });

    scored.sort((a, b) => b.score - a.score);
    const ordered = deClump(scored, limit);

    const result = [];
    for (const { item, interest } of ordered) {
      result.push({
        ...shapeFeedItem(item, { saved: saved.has(item._id) }),
        relevanceScore: Math.round(Math.min(1, interest.normalized) * 100),
        reason: reasonFor(item, interest, args.serendipity ?? false),
      });
    }

    return result;
  },
});

// ── Public: paginated mixed feed for infinite scroll ──────────────────────
// Chronological cursor over the cross-kind `by_order` index (orderAt desc),
// re-ranked interest-aware *within each page*. Unlike getFeed (an in-memory
// per-kind pool, no cursor), this supports true pagination for the discovery
// surface's auto infinite scroll. getFeed stays for the stable aside cap +
// home bento. Hidden + kind filtering happens post-paginate, so a page can
// shrink below `numItems` — the cursor/isDone stay correct, and the client
// guards the auto-loadMore loop. `returns` is omitted per AGENTS.md (the mapped
// item shape isn't a single provable validator), matching getFeed.
export const getFeedPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    kinds: v.optional(v.array(feedItemKindValidator)),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();
    const kindSet =
      args.kinds && args.kinds.length > 0 ? new Set(args.kinds) : null;

    const page = await ctx.db
      .query("feedItems")
      .withIndex("by_order")
      .order("desc")
      .paginate(args.paginationOpts);

    const interests = await loadInterestWeights(ctx, user._id);
    const hidden = await loadHiddenItemIds(ctx, user._id);
    const saved = await loadSavedItemIds(ctx, user._id);

    const scored = page.page
      .filter((item) => !hidden.has(item._id))
      .filter((item) => !kindSet || kindSet.has(item.kind))
      .map((item) => {
        const interest = interestMatch(item.topics, interests);
        const recency = recencyScore(item.publishedAt ?? item.lastSeenAt, now);
        const popularity = popularityScore(item.trendScore);
        const score =
          recency * 1.0 +
          popularity * 0.5 +
          interest.normalized * 1.5 +
          kindBoost(item.kind);
        return {
          shaped: {
            ...shapeFeedItem(item, { saved: saved.has(item._id) }),
            relevanceScore: Math.round(Math.min(1, interest.normalized) * 100),
            reason: reasonFor(item, interest, false),
          },
          score,
        };
      });

    scored.sort((a, b) => b.score - a.score);

    return { ...page, page: scored.map((entry) => entry.shaped) };
  },
});

// ── Public: saved items (collections sidebar) ─────────────────────────────
export const getSavedItems = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const limit = Math.min(args.limit ?? 20, 60);
    const saved = await ctx.db
      .query("savedFeedItems")
      .withIndex("by_owner_created", (q) => q.eq("ownerUserId", user._id))
      .order("desc")
      .take(limit);

    const items = (
      await Promise.all(
        saved.map(async (row) => {
          const item = await ctx.db.get("feedItems", row.feedItemId);
          if (!item) return null;
          return { ...shapeFeedItem(item, { saved: true }), savedAt: row.createdAt };
        }),
      )
    ).filter((item) => item !== null);
    return items;
  },
});

// ── Public: saved Discovery refs ──────────────────────────────────────────
// Search-result papers can be saved before they have a stable feed row in the
// UI. This query returns both the row id and paper key identities so clients do
// not need to infer saved state from loosely-shaped saved rows.
export const getSavedDiscoveryRefs = query({
  args: {
    itemRefs: v.optional(v.array(discoveryItemRefValidator)),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    if (args.itemRefs) {
      const perRef = await Promise.all(
        args.itemRefs.slice(0, 80).map(async (itemRef) => {
          const item = await feedItemForDiscoveryRef(ctx, itemRef);
          if (!item) return [];
          if (!(await isFeedItemSaved(ctx, user._id, item._id))) return [];
          const refs: DiscoveryResolvedRef[] = [];
          pushDiscoveryRefsForItem(refs, item);
          return refs;
        }),
      );
      return perRef.flat();
    }

    const limit = Math.min(args.limit ?? 200, 500);
    const saved = await ctx.db
      .query("savedFeedItems")
      .withIndex("by_owner_created", (q) => q.eq("ownerUserId", user._id))
      .order("desc")
      .take(limit);

    const perRow = await Promise.all(
      saved.map(async (row) => {
        const item = await ctx.db.get("feedItems", row.feedItemId);
        if (!item) return [];
        const refs: DiscoveryResolvedRef[] = [];
        pushDiscoveryRefsForItem(refs, item);
        return refs;
      }),
    );
    return perRow.flat();
  },
});

// ── Public: hidden Discovery refs ─────────────────────────────────────────
// Mirrors getSavedDiscoveryRefs for Papers search results. Hide actions may
// materialize a paper into feedItems, so the UI needs paper-key refs to filter
// future search responses instead of only hiding the current in-memory list.
export const getHiddenDiscoveryRefs = query({
  args: {
    itemRefs: v.optional(v.array(discoveryItemRefValidator)),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    if (args.itemRefs) {
      const perRef = await Promise.all(
        args.itemRefs.slice(0, 80).map(async (itemRef) => {
          const item = await feedItemForDiscoveryRef(ctx, itemRef);
          if (!item) return [];
          if (!(await isFeedItemHidden(ctx, user._id, item._id))) return [];
          const refs: DiscoveryResolvedRef[] = [];
          pushDiscoveryRefsForItem(refs, item);
          return refs;
        }),
      );
      return perRef.flat();
    }

    const limit = Math.min(args.limit ?? 200, 500);
    const hidden = await ctx.db
      .query("hiddenFeedItems")
      .withIndex("by_owner_created", (q) => q.eq("ownerUserId", user._id))
      .order("desc")
      .take(limit);

    const perRow = await Promise.all(
      hidden.map(async (row) => {
        const item = await ctx.db.get("feedItems", row.feedItemId);
        if (!item) return [];
        const refs: DiscoveryResolvedRef[] = [];
        pushDiscoveryRefsForItem(refs, item);
        return refs;
      }),
    );
    return perRow.flat();
  },
});

// ── Public: a single feed item by id (powers the news/fact detail pages) ──
// Returns null when missing; the detail page validates `kind` and renders an
// empty state on mismatch.
export const getFeedItem = query({
  args: { feedItemId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const id = ctx.db.normalizeId("feedItems", args.feedItemId);
    if (!id) return null;
    const item = await ctx.db.get("feedItems", id);
    if (!item) return null;
    return shapeFeedItem(item, {
      saved: await isFeedItemSaved(ctx, user._id, id),
    });
  },
});

// ── Public: same-kind related items for the detail-page "Discover more" rail ─
// Ranks a recent same-kind pool by shared-topic overlap, then recency.
export const getRelatedFeedItems = query({
  args: { feedItemId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const id = ctx.db.normalizeId("feedItems", args.feedItemId);
    if (!id) return [];
    const self = await ctx.db.get("feedItems", id);
    if (!self) return [];
    const limit = Math.min(args.limit ?? 6, 8);
    const pool = await ctx.db
      .query("feedItems")
      .withIndex("by_kind_published", (q) => q.eq("kind", self.kind))
      .order("desc")
      .take(limit * 4);
    const hidden = await loadHiddenItemIds(ctx, user._id);
    const saved = await loadSavedItemIds(ctx, user._id);
    const selfTopics = new Set(self.topics.map((topic) => topic.trim().toLowerCase()));
    return pool
      .filter((row) => row._id !== id && !hidden.has(row._id))
      .map((row) => ({
        row,
        overlap: row.topics.reduce(
          (count, topic) =>
            count + (selfTopics.has(topic.trim().toLowerCase()) ? 1 : 0),
          0,
        ),
        recency: row.publishedAt ?? row.lastSeenAt,
      }))
      .sort((a, b) => b.overlap - a.overlap || b.recency - a.recency)
      .slice(0, limit)
      .map((entry) =>
        shapeFeedItem(entry.row, {
          saved: saved.has(entry.row._id),
        }),
      );
  },
});

// ── Internal: top interest topics for a user (used by LLM feed actions) ───
export const userInterestTopics = internalQuery({
  args: { ownerUserId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("userFeedInterests")
      .withIndex("by_owner_topic", (q) => q.eq("ownerUserId", args.ownerUserId))
      .take(100);
    // Normalize on read so every consumer of the interest signal (feed scoring,
    // search recommendations) shares one lowercase-trimmed contract, and collapse
    // any case-variant rows (e.g. a seeded "machine learning" + an interaction-
    // bumped one) to the highest-weight occurrence.
    const limit = args.limit ?? 8;
    const seen = new Set<string>();
    const topics: string[] = [];
    for (const row of rows
      .filter((row) => row.weight > 0)
      .sort((a, b) => b.weight - a.weight)) {
      const topic = normalizeInterestTopic(row.topic);
      if (!topic || seen.has(topic)) continue;
      seen.add(topic);
      topics.push(topic);
      if (topics.length >= limit) break;
    }
    return topics;
  },
});

// ── Public: resolve supporting papers (evidence drawer) ───────────────────
export const papersByKeys = query({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx);
    const out = (
      await Promise.all(
        args.keys.slice(0, 12).map(async (key) => {
          const paper = await ctx.db
            .query("explorePapers")
            .withIndex("by_key", (q) => q.eq("key", key))
            .unique();
          if (!paper) return null;
          return {
            key: paper.key,
            title: paper.title,
            year: paper.year,
            url: paper.url,
            citedByCount: paper.citedByCount,
            isOpenAccess: paper.isOpenAccess,
          };
        }),
      )
    ).filter((paper) => paper !== null);
    return out;
  },
});

// ── Public: log a feed interaction (telemetry) ────────────────────────────
export const recordInteraction = mutation({
  args: {
    feedItemId: v.string(),
    kind: v.union(
      v.literal("save"),
      v.literal("hide"),
      v.literal("research"),
      v.literal("open_evidence"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const feedItemId = ctx.db.normalizeId("feedItems", args.feedItemId);
    if (!feedItemId) return null;
    await recordFeedInteractionForUser(ctx, user._id, feedItemId, args.kind);
    return null;
  },
});

// ── Public: save / unsave (persistent collection + interest signal) ───────
export const saveItem = mutation({
  args: { feedItemId: v.string() },
  returns: v.object({ saved: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const feedItemId = ctx.db.normalizeId("feedItems", args.feedItemId);
    if (!feedItemId) return { saved: false };
    return { saved: await saveFeedItemForUser(ctx, user._id, feedItemId) };
  },
});

export const unsaveItem = mutation({
  args: { feedItemId: v.string() },
  returns: v.object({ saved: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const feedItemId = ctx.db.normalizeId("feedItems", args.feedItemId);
    if (!feedItemId) return { saved: false };
    await removeSavedFeedItemForUser(ctx, user._id, feedItemId);
    return { saved: false };
  },
});

export const hideItem = mutation({
  args: { feedItemId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const feedItemId = ctx.db.normalizeId("feedItems", args.feedItemId);
    if (!feedItemId) return null;
    await hideFeedItemFull(ctx, user._id, feedItemId);
    return null;
  },
});

// ── Public: unified Discovery item actions ────────────────────────────────
// Discovery cards may point at an existing feedItems row or a live paper search
// result. Keep that identity split at this boundary so the UI can issue one
// action per intent without branching on storage details.
export const saveDiscoveryItem = mutation({
  args: { itemRef: discoveryItemRefValidator },
  returns: v.object({ saved: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const feedItemId = await resolveDiscoveryFeedItem(ctx, args.itemRef, {
      materializePaper: true,
    });
    if (!feedItemId) return { saved: false };
    return { saved: await saveFeedItemForUser(ctx, user._id, feedItemId) };
  },
});

export const unsaveDiscoveryItem = mutation({
  args: { itemRef: discoveryItemRefValidator },
  returns: v.object({ saved: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const feedItemId = await resolveDiscoveryFeedItem(ctx, args.itemRef, {
      materializePaper: false,
    });
    if (feedItemId) await removeSavedFeedItemForUser(ctx, user._id, feedItemId);
    return { saved: false };
  },
});

export const hideDiscoveryItem = mutation({
  args: { itemRef: discoveryItemRefValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const feedItemId = await resolveDiscoveryFeedItem(ctx, args.itemRef, {
      materializePaper: true,
    });
    if (!feedItemId) return null;
    await hideFeedItemFull(ctx, user._id, feedItemId);
    return null;
  },
});

export const recordDiscoveryInteraction = mutation({
  args: {
    itemRef: discoveryItemRefValidator,
    kind: v.union(
      v.literal("save"),
      v.literal("hide"),
      v.literal("research"),
      v.literal("open_evidence"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const feedItemId = await resolveDiscoveryFeedItem(ctx, args.itemRef, {
      materializePaper: true,
    });
    if (!feedItemId) return null;
    await recordFeedInteractionForUser(ctx, user._id, feedItemId, args.kind);
    return null;
  },
});

// ── Internal: upsert feed items (dedupe by dedupeKey) ─────────────────────
export const upsertFeedItems = internalMutation({
  args: { items: v.array(feedItemValidator) },
  returns: v.object({ inserted: v.number(), updated: v.number() }),
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const item of args.items) {
      const orderAt = deriveOrderAt(item);
      const existing = await ctx.db
        .query("feedItems")
        .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", item.dedupeKey))
        .unique();
      if (existing) {
        const { createdAt, ...refreshFields } = item;
        void createdAt;
        // Refresh orderAt too so a re-seen item without publishedAt bubbles up
        // by lastSeenAt (keeps the chronological by_order index live).
        await ctx.db.patch("feedItems", existing._id, { ...refreshFields, orderAt });
        updated += 1;
      } else {
        await ctx.db.insert("feedItems", { ...item, orderAt });
        inserted += 1;
      }
    }
    return { inserted, updated };
  },
});

// ── Internal: refresh trending papers (cron + manual trigger) ─────────────
export const refreshTrendingPapers = internalAction({
  args: { limit: v.optional(v.number()) },
  returns: v.object({
    fetched: v.number(),
    inserted: v.number(),
    updated: v.number(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? TRENDING_LIMIT, 50);
    // includeRetracted so we can flag retracted-but-trending papers rather
    // than silently dropping them (post-retraction citation spreads).
    const { candidates, works } = await fetchOpenAlexWorksService(ctx, {
      query: "",
      limit,
      includeRetracted: true,
    });
    const papers = candidatesToExplorePapers(candidates, limit);
    if (papers.length === 0) {
      return { fetched: 0, inserted: 0, updated: 0 };
    }

    const retractedIds = new Set<string>();
    for (const work of works) {
      if (work.is_retracted) {
        for (const id of workIdentifiers(work)) retractedIds.add(id);
      }
    }

    await ctx.runMutation(internal.explore.upsertPaperCache, {
      papers,
      lastSeenAt: Date.now(),
    });

    const now = Date.now();
    const items = papers.map((paper) =>
      paperToFeedItem(paper, now, retractedIds),
    );
    const result: { inserted: number; updated: number } = await ctx.runMutation(
      internal.feed.upsertFeedItems,
      { items },
    );

    return { fetched: papers.length, ...result };
  },
});

// ── Internal: feed hydration orchestrator (single 3h cron) ────────────────
// Replaces the five separate feed crons. `crons.interval` has no per-job
// offset, so one parent cron fans the lanes out with `scheduler.runAfter`
// staggers — spacing the providers apart to avoid a thundering herd and to
// respect each provider's rate budget. Each child is scheduled (never awaited):
// the orchestrator must finish in well under the action limit, and per-lane
// failures are already soft-failed inside each child. The Bahasa Indonesia
// backfill lane is intentionally omitted for now (the Google News lane is
// already hl=id) — re-enable it later by adding one more runAfter.
const HYDRATE_STAGGER = {
  trendingPapers: 0,
  trendingTopics: 20 * 60_000,
  googleNews: 40 * 60_000,
  factCheckClaims: 60 * 60_000,
  enrichGoogleNews: 100 * 60_000,
} as const;

export const hydrateCycle = internalAction({
  args: {},
  returns: v.object({ scheduled: v.number() }),
  handler: async (ctx): Promise<{ scheduled: number }> => {
    await ctx.scheduler.runAfter(
      HYDRATE_STAGGER.trendingPapers,
      internal.feed.refreshTrendingPapers,
      {},
    );
    await ctx.scheduler.runAfter(
      HYDRATE_STAGGER.trendingTopics,
      internal.feed.sources.refreshTrendingTopics,
      {},
    );
    await ctx.scheduler.runAfter(
      HYDRATE_STAGGER.googleNews,
      internal.feed.sources.refreshGoogleNews,
      {},
    );
    await ctx.scheduler.runAfter(
      HYDRATE_STAGGER.factCheckClaims,
      internal.feed.claims.refreshFactCheckClaims,
      {},
    );
    await ctx.scheduler.runAfter(
      HYDRATE_STAGGER.enrichGoogleNews,
      internal.feed.sources.enrichGoogleNewsArticles,
      {},
    );
    return { scheduled: 5 };
  },
});

// ── Ranking helpers ───────────────────────────────────────────────────────

type InterestWeights = Map<string, number>;

async function loadInterestWeights(
  ctx: QueryCtx,
  ownerUserId: string,
): Promise<InterestWeights> {
  const rows = await ctx.db
    .query("userFeedInterests")
    .withIndex("by_owner_topic", (q) => q.eq("ownerUserId", ownerUserId))
    .take(200);
  const map: InterestWeights = new Map();
  for (const row of rows) {
    map.set(row.topic.trim().toLowerCase(), row.weight);
  }
  return map;
}

async function loadHiddenItemIds(
  ctx: QueryCtx,
  ownerUserId: string,
): Promise<Set<string>> {
  const hiddenRows = await ctx.db
    .query("hiddenFeedItems")
    .withIndex("by_owner_created", (q) => q.eq("ownerUserId", ownerUserId))
    .order("desc")
    .take(1_000);
  return new Set(hiddenRows.map((row) => row.feedItemId));
}

async function loadSavedItemIds(
  ctx: QueryCtx,
  ownerUserId: string,
): Promise<Set<string>> {
  const rows = await ctx.db
    .query("savedFeedItems")
    .withIndex("by_owner_created", (q) => q.eq("ownerUserId", ownerUserId))
    .take(500);
  return new Set(rows.map((row) => row.feedItemId));
}

async function isFeedItemSaved(
  ctx: QueryCtx,
  ownerUserId: string,
  feedItemId: Doc<"feedItems">["_id"],
): Promise<boolean> {
  const existing = await ctx.db
    .query("savedFeedItems")
    .withIndex("by_owner_item", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("feedItemId", feedItemId),
    )
    .unique();
  return Boolean(existing);
}

async function isFeedItemHidden(
  ctx: QueryCtx,
  ownerUserId: string,
  feedItemId: Doc<"feedItems">["_id"],
): Promise<boolean> {
  const existing = await ctx.db
    .query("hiddenFeedItems")
    .withIndex("by_owner_item", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("feedItemId", feedItemId),
    )
    .unique();
  return Boolean(existing);
}

function pushDiscoveryRefsForItem(
  refs: DiscoveryResolvedRef[],
  item: Doc<"feedItems">,
): void {
  refs.push({ kind: "feed", feedItemId: item._id });
  if (item.paperKey) {
    refs.push({ kind: "paper", paperKey: item.paperKey });
  }
}

async function hideFeedItemForUser(
  ctx: MutationCtx,
  ownerUserId: string,
  feedItemId: Doc<"feedItems">["_id"],
) {
  const existing = await ctx.db
    .query("hiddenFeedItems")
    .withIndex("by_owner_item", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("feedItemId", feedItemId),
    )
    .unique();
  if (existing) return;
  await ctx.db.insert("hiddenFeedItems", {
    ownerUserId,
    feedItemId,
    createdAt: Date.now(),
  });
}

// Persist a save + log the interaction + nudge interests. Idempotent.
async function saveFeedItemForUser(
  ctx: MutationCtx,
  ownerUserId: string,
  feedItemId: Doc<"feedItems">["_id"],
): Promise<boolean> {
  const existing = await ctx.db
    .query("savedFeedItems")
    .withIndex("by_owner_item", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("feedItemId", feedItemId),
    )
    .unique();
  if (existing) return true;

  const item = await ctx.db.get("feedItems", feedItemId);
  await ctx.db.insert("savedFeedItems", {
    ownerUserId,
    feedItemId,
    createdAt: Date.now(),
  });
  await ctx.db.insert("feedInteractions", {
    ownerUserId,
    feedItemId,
    kind: "save",
    createdAt: Date.now(),
  });
  if (item) await bumpInterests(ctx, ownerUserId, item.topics, 1);
  return true;
}

async function removeSavedFeedItemForUser(
  ctx: MutationCtx,
  ownerUserId: string,
  feedItemId: Doc<"feedItems">["_id"],
): Promise<void> {
  const existing = await ctx.db
    .query("savedFeedItems")
    .withIndex("by_owner_item", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("feedItemId", feedItemId),
    )
    .unique();
  if (existing) await ctx.db.delete("savedFeedItems", existing._id);
}

// Hide + log the interaction + decay interests.
async function hideFeedItemFull(
  ctx: MutationCtx,
  ownerUserId: string,
  feedItemId: Doc<"feedItems">["_id"],
): Promise<void> {
  await hideFeedItemForUser(ctx, ownerUserId, feedItemId);
  await ctx.db.insert("feedInteractions", {
    ownerUserId,
    feedItemId,
    kind: "hide",
    createdAt: Date.now(),
  });
  const item = await ctx.db.get("feedItems", feedItemId);
  if (item) await bumpInterests(ctx, ownerUserId, item.topics, -1);
}

async function recordFeedInteractionForUser(
  ctx: MutationCtx,
  ownerUserId: string,
  feedItemId: Doc<"feedItems">["_id"],
  kind: "save" | "hide" | "research" | "open_evidence",
): Promise<void> {
  await ctx.db.insert("feedInteractions", {
    ownerUserId,
    feedItemId,
    kind,
    createdAt: Date.now(),
  });
  if (kind === "hide") {
    await hideFeedItemForUser(ctx, ownerUserId, feedItemId);
  }
  // "Teliti ini" is a strong positive signal for the interest model.
  if (kind === "research") {
    const item = await ctx.db.get("feedItems", feedItemId);
    if (item) await bumpInterests(ctx, ownerUserId, item.topics, 2);
  }
}

// Resolve the feedItems row for a paper, materializing it from the shared
// explorePapers cache on first save/hide if it isn't a cron-ingested item yet.
async function ensureFeedItemForPaperKey(
  ctx: MutationCtx,
  paperKey: string,
): Promise<Doc<"feedItems">["_id"] | null> {
  const existing = await existingFeedItemForPaperKey(ctx, paperKey);
  if (existing) return existing._id;

  const paper = await ctx.db
    .query("explorePapers")
    .withIndex("by_key", (q) => q.eq("key", paperKey))
    .unique();
  if (!paper) return null;

  const item = paperToFeedItem(
    explorePaperDocToModel(paper),
    Date.now(),
    new Set<string>(),
  );
  return await ctx.db.insert("feedItems", {
    ...item,
    orderAt: deriveOrderAt(item),
  });
}

async function existingFeedItemForPaperKey(
  ctx: QueryCtx | MutationCtx,
  paperKey: string,
): Promise<Doc<"feedItems"> | null> {
  return await ctx.db
    .query("feedItems")
    .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", `paper:${paperKey}`))
    .unique();
}

async function feedItemForDiscoveryRef(
  ctx: QueryCtx | MutationCtx,
  itemRef: DiscoveryItemRef,
): Promise<Doc<"feedItems"> | null> {
  if (itemRef.kind === "feed") {
    const id = ctx.db.normalizeId("feedItems", itemRef.feedItemId);
    return id ? await ctx.db.get("feedItems", id) : null;
  }
  return await existingFeedItemForPaperKey(ctx, itemRef.paperKey);
}

async function resolveDiscoveryFeedItem(
  ctx: MutationCtx,
  itemRef: DiscoveryItemRef,
  options: { materializePaper: boolean },
): Promise<Doc<"feedItems">["_id"] | null> {
  if (itemRef.kind === "feed") {
    return ctx.db.normalizeId("feedItems", itemRef.feedItemId);
  }
  if (!options.materializePaper) {
    return (await existingFeedItemForPaperKey(ctx, itemRef.paperKey))?._id ?? null;
  }
  return await ensureFeedItemForPaperKey(ctx, itemRef.paperKey);
}

function explorePaperDocToModel(paper: Doc<"explorePapers">): ExplorePaper {
  const { _id, _creationTime, lastSeenAt, ...fields } = paper;
  void _id;
  void _creationTime;
  void lastSeenAt;
  return fields;
}

function interestMatch(
  topics: string[],
  interests: InterestWeights,
): { normalized: number; topTopic?: string } {
  let total = 0;
  let topTopic: string | undefined;
  let topWeight = 0;
  for (const topic of topics) {
    const weight = interests.get(topic.trim().toLowerCase());
    if (weight && weight > 0) {
      total += weight;
      if (weight > topWeight) {
        topWeight = weight;
        topTopic = topic;
      }
    }
  }
  // Squash to ~0..1 (a weight of ~5 across topics ≈ saturated interest).
  const normalized = total <= 0 ? 0 : total / (total + 4);
  return { normalized, topTopic };
}

function recencyScore(timestamp: number, now: number): number {
  const ageDays = Math.max(0, (now - timestamp) / DAY_MS);
  return Math.exp(-ageDays / RECENCY_HALF_LIFE_DAYS);
}

function popularityScore(trendScore: number): number {
  if (!trendScore || trendScore <= 0) return 0;
  // log10 normalized: ~1.0 around 100k citations / volume.
  return Math.min(1, Math.log10(trendScore + 1) / 5);
}

// Small per-kind nudge so the mixed feed always surfaces non-paper lanes.
function kindBoost(kind: Doc<"feedItems">["kind"]): number {
  switch (kind) {
    case "claim":
      return 0.25;
    case "idea":
      return 0.25;
    case "topic":
      return 0.2;
    case "news":
      return 0.15;
    default:
      return 0;
  }
}

// Greedy re-order so no more than 2 of the same kind appear consecutively,
// keeping higher-scored items earlier. Prevents a wall of papers.
function deClump<T extends { item: Doc<"feedItems"> }>(
  scored: T[],
  limit: number,
): T[] {
  const out: T[] = [];
  const pool = [...scored]; // already sorted by score desc
  while (out.length < limit && pool.length > 0) {
    let pickIndex = 0;
    // Avoid ANY two consecutive items of the same kind: if the top-scored
    // candidate repeats the previous kind, take the next-best different kind.
    if (out.length >= 1) {
      const prev = out[out.length - 1].item.kind;
      if (pool[0].item.kind === prev) {
        const alt = pool.findIndex((entry) => entry.item.kind !== prev);
        if (alt >= 0) pickIndex = alt;
      }
    }
    out.push(pool.splice(pickIndex, 1)[0]);
  }
  return out;
}

function reasonFor(
  item: Doc<"feedItems">,
  interest: { topTopic?: string },
  serendipity: boolean,
): string {
  if (serendipity) return "Bidang bersebelahan";
  if (interest.topTopic) return `Karena minat: ${interest.topTopic}`;
  switch (item.kind) {
    case "claim":
      return "Klaim diperiksa pemeriksa fakta";
    case "topic":
      return "Sedang ramai diperbincangkan";
    case "news":
      return "Berita sains terbaru";
    case "idea":
      return "Celah riset untuk digali";
    default:
      return item.trendScore > 0 ? "Banyak disitasi" : "Baru terbit";
  }
}

async function bumpInterests(
  ctx: MutationCtx,
  ownerUserId: string,
  topics: string[],
  delta: number,
): Promise<void> {
  const now = Date.now();
  for (const raw of topics.slice(0, 5)) {
    // Store normalized so interaction bumps share rows with the seeded topics
    // (both go through the canonical normalizer) instead of forking a case
    // variant; loadInterestWeights/interestMatch already look up lowercased.
    const topic = normalizeInterestTopic(raw);
    if (!topic) continue;
    const existing = await ctx.db
      .query("userFeedInterests")
      .withIndex("by_owner_topic", (q) =>
        q.eq("ownerUserId", ownerUserId).eq("topic", topic),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("userFeedInterests", existing._id, {
        weight: existing.weight + delta,
        updatedAt: now,
      });
    } else if (delta > 0) {
      await ctx.db.insert("userFeedInterests", {
        ownerUserId,
        topic,
        weight: delta,
        updatedAt: now,
      });
    }
  }
}

// ── Item builders ──────────────────────────────────────────────────────────

function paperToFeedItem(
  paper: ExplorePaper,
  now: number,
  retractedIds: Set<string>,
) {
  const publishedAt = paper.publicationDate
    ? parseDateMs(paper.publicationDate)
    : undefined;
  const retracted =
    (paper.doi && retractedIds.has(normalizeDoiLoose(paper.doi))) ||
    (paper.openalexId && retractedIds.has(paper.openalexId));
  return {
    kind: "paper" as const,
    title: paper.title,
    summary: trim(paper.snippet, 400),
    tldr: firstSentence(paper.abstract ?? paper.snippet),
    url: paper.url,
    provider: "openalex" as const,
    sourceLabel: paper.sourceLabel,
    paperKey: paper.key,
    doi: paper.doi,
    authors: paper.authors.length > 0 ? paper.authors : undefined,
    year: paper.year,
    venue: paper.venue,
    pdfUrl: paper.pdfUrl,
    citedByCount: paper.citedByCount,
    isOpenAccess: paper.isOpenAccess,
    topics: paper.topics,
    trendScore: paper.citedByCount ?? paper.score ?? 0,
    retractionStatus: retracted ? ("retracted" as const) : ("none" as const),
    publishedAt,
    dedupeKey: `paper:${paper.key}`,
    lastSeenAt: now,
    createdAt: now,
  };
}

function firstSentence(text: string): string | undefined {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  const match = clean.match(/^.*?[.!?](?=\s|$)/);
  return trim(match ? match[0] : clean, 220);
}

function trim(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function parseDateMs(value: string): number | undefined {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}
