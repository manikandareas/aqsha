import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  fetchGdeltTopicTimeline,
  summarizeTimeline,
} from "./providers/gdelt";
import {
  buildGoogleNewsFeedItems,
  dedupeGoogleNewsItems,
  fetchGoogleNews,
  googleNewsSearchUrl,
  googleNewsTopicUrl,
  type GoogleNewsItem,
} from "./providers/googleNews";
import { resolvePublisherUrl } from "./providers/googleNewsDecode";
import { fetchArticlePreview } from "../papers/articlePreview";

// Research-relevant topics tracked for the "topik naik daun" lane.
// GDELT rate-limits to ~1 request / 5s per IP, so we keep the seed list small
// and space the requests out (see GDELT_REQUEST_SPACING_MS).
const TOPIC_SEEDS: Array<{ label: string; query: string }> = [
  { label: "Kecerdasan Buatan", query: "kecerdasan buatan" },
  { label: "Perubahan Iklim", query: "perubahan iklim" },
  { label: "Energi Terbarukan", query: "energi terbarukan" },
  { label: "Kesehatan Mental", query: "kesehatan mental" },
  { label: "Keamanan Pangan", query: "keamanan pangan" },
  { label: "Bioteknologi", query: "bioteknologi" },
  { label: "Stunting", query: "stunting" },
  { label: "Bencana Alam", query: "bencana alam" },
];

const GDELT_REQUEST_SPACING_MS = 5_200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TOPIC_TIMESPAN = "3m";

// Indonesian science/health news seeds for the Google News RSS lane. Search
// seeds use Google News query operators (when:7d window, OR groups,
// -exclusions); topic seeds pull the curated SCIENCE/HEALTH sections.
const GOOGLE_NEWS_SEARCH_SEEDS: Array<{ label: string; query: string }> = [
  { label: "Kesehatan", query: "kesehatan OR medis OR penyakit when:7d -hoaks" },
  { label: "Sains", query: "sains OR penelitian OR riset when:7d" },
  { label: "Lingkungan", query: "lingkungan OR iklim OR energi when:7d" },
];
const GOOGLE_NEWS_TOPIC_SEEDS: Array<{ label: string; topic: string }> = [
  { label: "Sains", topic: "SCIENCE" },
  { label: "Kesehatan", topic: "HEALTH" },
];
const GOOGLE_NEWS_PER_SEED = 6;
const GOOGLE_NEWS_TOTAL_CAP = 16;
// Polite spacing between Google News fetches (no official API/SLA).
const GOOGLE_NEWS_SEED_SPACING_MS = 1_500;
const GOOGLE_NEWS_ENRICH_BATCH = 6;
const GOOGLE_NEWS_ENRICH_SPACING_MS = 1_200;
// Cap enrichment retries per item so unresolvable links (the current Google URL
// format rarely decodes) or body-less pages stop re-hitting external services
// every cycle. The sweep converges once every item has been tried this many times.
const MAX_ENRICH_ATTEMPTS = 2;

// ── Internal: refresh trending topics (GDELT, free) ───────────────────────
export const refreshTrendingTopics = internalAction({
  args: {},
  returns: v.object({
    fetched: v.number(),
    inserted: v.number(),
    updated: v.number(),
  }),
  handler: async (
    ctx,
  ): Promise<{ fetched: number; inserted: number; updated: number }> => {
    const now = Date.now();
    const items = [];
    for (let i = 0; i < TOPIC_SEEDS.length; i += 1) {
      const seed = TOPIC_SEEDS[i];
      // Respect GDELT's ~1 request / 5s limit (it returns a plain-text warning
      // instead of JSON when exceeded).
      if (i > 0) await sleep(GDELT_REQUEST_SPACING_MS);
      const timeline = await fetchGdeltTopicTimeline(ctx, {
        query: seed.query,
        timespan: TOPIC_TIMESPAN,
      });
      const { sparkline, trendScore } = summarizeTimeline(timeline.values);
      if (sparkline.length === 0 || trendScore <= 0) continue;
      items.push({
        kind: "topic" as const,
        title: seed.label,
        summary: `Volume pemberitaan Indonesia untuk "${seed.label}" dalam 3 bulan terakhir.`,
        url: `https://news.google.com/search?q=${encodeURIComponent(seed.query)}&hl=id&gl=ID`,
        provider: "gdelt" as const,
        sourceLabel: "GDELT",
        topics: [seed.label],
        trendScore,
        sparkline,
        publishedAt: now,
        dedupeKey: `topic:gdelt:${seed.label}`,
        lastSeenAt: now,
        createdAt: now,
      });
    }

    if (items.length === 0) {
      return { fetched: 0, inserted: 0, updated: 0 };
    }
    const result: { inserted: number; updated: number } = await ctx.runMutation(
      internal.feed.upsertFeedItems,
      { items },
    );
    return { fetched: items.length, ...result };
  },
});

// ── Internal: refresh news (Google News RSS, free) ────────────────────────
// Replaces the paid Exa news lane. Fetches the Indonesian-edition search +
// topic feeds with polite spacing, dedupes across seeds, and upserts
// `kind="news"` items. Article bodies + publisher URLs are filled separately by
// enrichGoogleNewsArticles (decode is fragile, so it must not block ingestion).
export const refreshGoogleNews = internalAction({
  args: { perSeed: v.optional(v.number()) },
  returns: v.object({
    fetched: v.number(),
    inserted: v.number(),
    updated: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ fetched: number; inserted: number; updated: number }> => {
    const now = Date.now();
    const perSeed = Math.min(args.perSeed ?? GOOGLE_NEWS_PER_SEED, 12);
    const seeds: Array<{ label: string; url: string }> = [
      ...GOOGLE_NEWS_SEARCH_SEEDS.map((seed) => ({
        label: seed.label,
        url: googleNewsSearchUrl(seed.query),
      })),
      ...GOOGLE_NEWS_TOPIC_SEEDS.map((seed) => ({
        label: seed.label,
        url: googleNewsTopicUrl(seed.topic),
      })),
    ];

    const bySeed: Array<{ label: string; items: GoogleNewsItem[] }> = [];
    for (let i = 0; i < seeds.length; i += 1) {
      if (i > 0) await sleep(GOOGLE_NEWS_SEED_SPACING_MS);
      try {
        const items = await fetchGoogleNews(ctx, {
          url: seeds[i].url,
          limit: perSeed,
        });
        bySeed.push({ label: seeds[i].label, items });
      } catch {
        bySeed.push({ label: seeds[i].label, items: [] });
      }
    }

    const collected = dedupeGoogleNewsItems(bySeed, GOOGLE_NEWS_TOTAL_CAP);
    if (collected.length === 0) {
      return { fetched: 0, inserted: 0, updated: 0 };
    }

    const items = buildGoogleNewsFeedItems(collected, now);
    const result: { inserted: number; updated: number } = await ctx.runMutation(
      internal.feed.upsertFeedItems,
      { items },
    );

    // Article enrichment (resolve publisher URL → extract body) is scheduled by
    // the feed:hydrate-cycle orchestrator (internal.feed.hydrateCycle) on its
    // own stagger, so this lane no longer self-schedules it.
    return { fetched: items.length, ...result };
  },
});

// ── Internal: Google News items still missing an extracted article body ────
export const googleNewsItemsNeedingEnrichment = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      feedItemId: v.id("feedItems"),
      url: v.string(),
      hasSummary: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? GOOGLE_NEWS_ENRICH_BATCH, 20);
    const recent = await ctx.db
      .query("feedItems")
      .withIndex("by_kind_published", (q) => q.eq("kind", "news"))
      .order("desc")
      .take(limit * 6);
    return recent
      .filter(
        (row) =>
          row.provider === "google_news" &&
          row.articleText === undefined &&
          (row.enrichAttempts ?? 0) < MAX_ENRICH_ATTEMPTS,
      )
      .slice(0, limit)
      .map((row) => ({
        feedItemId: row._id,
        url: row.url,
        hasSummary: row.summary.trim().length > 0,
      }));
  },
});

// ── Internal: persist resolved URL + extracted body for Google News items ──
export const patchGoogleNewsEnrichment = internalMutation({
  args: {
    patches: v.array(
      v.object({
        feedItemId: v.id("feedItems"),
        resolvedUrl: v.optional(v.string()),
        articleText: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
        summary: v.optional(v.string()),
        tldr: v.optional(v.string()),
      }),
    ),
  },
  returns: v.object({ patched: v.number() }),
  handler: async (ctx, args) => {
    let patched = 0;
    for (const update of args.patches) {
      const existing = await ctx.db.get("feedItems", update.feedItemId);
      if (!existing) continue;
      // Always record the attempt so failed/body-less rows converge out of the
      // enrichment predicate (bounds external IO). Body/URL fields are applied
      // only when present, and never overwrite existing values.
      const patch: {
        enrichAttempts: number;
        resolvedUrl?: string;
        articleText?: string;
        imageUrl?: string;
        summary?: string;
        tldr?: string;
      } = { enrichAttempts: (existing.enrichAttempts ?? 0) + 1 };
      if (update.resolvedUrl) patch.resolvedUrl = update.resolvedUrl;
      if (update.articleText) {
        patch.articleText = update.articleText;
        patched += 1;
      }
      if (update.imageUrl && !existing.imageUrl) patch.imageUrl = update.imageUrl;
      if (update.summary && existing.summary.trim().length === 0) {
        patch.summary = update.summary;
      }
      if (update.tldr && existing.tldr === undefined) patch.tldr = update.tldr;
      await ctx.db.patch("feedItems", update.feedItemId, patch);
    }
    return { patched };
  },
});

// ── Internal: enrich Google News items (resolve URL + extract body) ────────
export const enrichGoogleNewsArticles = internalAction({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ scanned: v.number(), patched: v.number() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ scanned: number; patched: number }> => {
    const targets: Array<{
      feedItemId: Id<"feedItems">;
      url: string;
      hasSummary: boolean;
    }> = await ctx.runQuery(
      internal.feed.sources.googleNewsItemsNeedingEnrichment,
      { limit: args.limit },
    );
    if (targets.length === 0) {
      return { scanned: 0, patched: 0 };
    }

    const patches: Array<{
      feedItemId: Id<"feedItems">;
      resolvedUrl?: string;
      articleText?: string;
      imageUrl?: string;
      summary?: string;
      tldr?: string;
    }> = [];
    for (let i = 0; i < targets.length; i += 1) {
      if (i > 0) await sleep(GOOGLE_NEWS_ENRICH_SPACING_MS);
      const target = targets[i];
      // Always push a patch (even on resolve/extract failure) so the mutation
      // records the attempt and the row eventually drops out of the sweep.
      const patch: {
        feedItemId: Id<"feedItems">;
        resolvedUrl?: string;
        articleText?: string;
        imageUrl?: string;
        summary?: string;
        tldr?: string;
      } = { feedItemId: target.feedItemId };
      const resolvedUrl = await resolvePublisherUrl(target.url);
      if (resolvedUrl) {
        patch.resolvedUrl = resolvedUrl;
        const preview = await fetchArticlePreview(resolvedUrl);
        if (preview.imageUrl) patch.imageUrl = preview.imageUrl;
        if (preview.articleText) {
          patch.articleText = preview.articleText;
          patch.tldr = firstSentence(preview.articleText);
          if (!target.hasSummary) {
            patch.summary = leadFromArticle(preview.articleText);
          }
        }
      }
      patches.push(patch);
    }

    const { patched }: { patched: number } = await ctx.runMutation(
      internal.feed.sources.patchGoogleNewsEnrichment,
      { patches },
    );
    return { scanned: targets.length, patched };
  },
});

// ── Internal: purge legacy Exa news rows (one-time, owner-invoked) ─────────
// The `exa_news` literal stays in the validators (additive); this only removes
// the stale rows left from the Exa news lane. Paginated + self-scheduling
// continuation per the bounded-read rule (never .collect() a growing table).
export const purgeLegacyExaNews = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ deleted: v.number(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("feedItems")
      .withIndex("by_kind_published", (q) => q.eq("kind", "news"))
      .paginate(args.paginationOpts);
    let deleted = 0;
    for (const row of page.page) {
      if (row.provider === "exa_news") {
        await ctx.db.delete("feedItems", row._id);
        deleted += 1;
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.feed.sources.purgeLegacyExaNews,
        {
          paginationOpts: {
            numItems: args.paginationOpts.numItems,
            cursor: page.continueCursor,
          },
        },
      );
    }
    return { deleted, isDone: page.isDone };
  },
});

function firstSentence(text: string): string | undefined {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  const match = clean.match(/^.*?[.!?](?=\s|$)/);
  const value = match ? match[0] : clean;
  return value.length > 200 ? `${value.slice(0, 199).trimEnd()}…` : value;
}

// A longer card/reader lead derived from the extracted article body, used when
// a Google News item has no summary yet (the RSS feed gives none).
function leadFromArticle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 280 ? `${clean.slice(0, 279).trimEnd()}…` : clean;
}
