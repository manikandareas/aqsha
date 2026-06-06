import { v } from "convex/values";
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
import { feedItemValidator, feedItemKindValidator } from "./feedValidators";
import { candidatesToExplorePapers, type ExplorePaper } from "./exploreModel";
import {
  fetchOpenAlexWorksService,
  workIdentifiers,
  normalizeDoiLoose,
} from "./feedOpenAlex";

const TRENDING_LIMIT = 24;
const FEED_PAGE_LIMIT = 40;
const RECENCY_HALF_LIFE_DAYS = 21;
const DAY_MS = 1000 * 60 * 60 * 24;

const FEED_KINDS = ["paper", "news", "claim", "topic", "idea"] as const;

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
      const { _creationTime, ...rest } = item;
      void _creationTime;
      result.push({
        ...rest,
        claim: item.primaryClaim,
        relevanceScore: Math.round(Math.min(1, interest.normalized) * 100),
        reason: reasonFor(item, interest, args.serendipity ?? false),
      });
    }

    return result;
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

    const items = [];
    for (const row of saved) {
      const item = await ctx.db.get("feedItems", row.feedItemId);
      if (!item) continue;
      const { _creationTime, ...rest } = item;
      void _creationTime;
      items.push({ ...rest, savedAt: row.createdAt });
    }
    return items;
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
    return rows
      .filter((row) => row.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, args.limit ?? 8)
      .map((row) => row.topic);
  },
});

// ── Public: resolve supporting papers (evidence drawer) ───────────────────
export const papersByKeys = query({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx);
    const out = [];
    for (const key of args.keys.slice(0, 12)) {
      const paper = await ctx.db
        .query("explorePapers")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (paper) {
        out.push({
          key: paper.key,
          title: paper.title,
          year: paper.year,
          url: paper.url,
          citedByCount: paper.citedByCount,
          isOpenAccess: paper.isOpenAccess,
        });
      }
    }
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
    await ctx.db.insert("feedInteractions", {
      ownerUserId: user._id,
      feedItemId,
      kind: args.kind,
      createdAt: Date.now(),
    });
    if (args.kind === "hide") {
      await hideFeedItemForUser(ctx, user._id, feedItemId);
    }
    // "Teliti ini" is a strong positive signal for the interest model.
    if (args.kind === "research") {
      const item = await ctx.db.get("feedItems", feedItemId);
      if (item) await bumpInterests(ctx, user._id, item.topics, 2);
    }
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

    const existing = await ctx.db
      .query("savedFeedItems")
      .withIndex("by_owner_item", (q) =>
        q.eq("ownerUserId", user._id).eq("feedItemId", feedItemId),
      )
      .unique();
    if (existing) return { saved: true };

    const item = await ctx.db.get("feedItems", feedItemId);
    await ctx.db.insert("savedFeedItems", {
      ownerUserId: user._id,
      feedItemId,
      createdAt: Date.now(),
    });
    await ctx.db.insert("feedInteractions", {
      ownerUserId: user._id,
      feedItemId,
      kind: "save",
      createdAt: Date.now(),
    });
    if (item) await bumpInterests(ctx, user._id, item.topics, 1);
    return { saved: true };
  },
});

export const unsaveItem = mutation({
  args: { feedItemId: v.string() },
  returns: v.object({ saved: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const feedItemId = ctx.db.normalizeId("feedItems", args.feedItemId);
    if (!feedItemId) return { saved: false };
    const existing = await ctx.db
      .query("savedFeedItems")
      .withIndex("by_owner_item", (q) =>
        q.eq("ownerUserId", user._id).eq("feedItemId", feedItemId),
      )
      .unique();
    if (existing) await ctx.db.delete("savedFeedItems", existing._id);
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
    await hideFeedItemForUser(ctx, user._id, feedItemId);
    await ctx.db.insert("feedInteractions", {
      ownerUserId: user._id,
      feedItemId,
      kind: "hide",
      createdAt: Date.now(),
    });
    const item = await ctx.db.get("feedItems", feedItemId);
    if (item) await bumpInterests(ctx, user._id, item.topics, -1);
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
      const existing = await ctx.db
        .query("feedItems")
        .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", item.dedupeKey))
        .unique();
      if (existing) {
        const { createdAt, ...refreshFields } = item;
        void createdAt;
        await ctx.db.patch("feedItems", existing._id, refreshFields);
        updated += 1;
      } else {
        await ctx.db.insert("feedItems", item);
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
    const topic = raw.trim();
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
