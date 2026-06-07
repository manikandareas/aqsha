import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  fetchGdeltTopicTimeline,
  summarizeTimeline,
} from "./agent/gdeltProvider";
import { fetchScienceNews } from "./agent/newsProvider";
import { fetchArticlePreview } from "./articlePreview";

const DAY_MS = 1000 * 60 * 60 * 24;

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

// Indonesian-language science/health news seeds for the Exa news lane.
const NEWS_SEEDS: Array<{ label: string; query: string }> = [
  { label: "Sains", query: "penelitian sains terbaru Indonesia" },
  { label: "Kesehatan", query: "kesehatan riset terbaru" },
  { label: "Teknologi", query: "teknologi sains terbaru" },
  { label: "Lingkungan", query: "perubahan iklim lingkungan riset" },
];

const TOPIC_TIMESPAN = "3m";
const NEWS_WINDOW_DAYS = 21;
const NEWS_PER_SEED = 4;
const NEWS_TOTAL_CAP = 12;

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

// ── Internal: refresh science news (Exa, low cadence) ─────────────────────
export const refreshScienceNews = internalAction({
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
    const startPublishedDate = new Date(now - NEWS_WINDOW_DAYS * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const perSeed = Math.min(args.perSeed ?? NEWS_PER_SEED, 8);

    // Gather deduped articles (capped) first so the body fetches can run
    // concurrently afterwards.
    const seen = new Set<string>();
    const collected: Array<{
      article: Awaited<ReturnType<typeof fetchScienceNews>>[number];
      topicLabel: string;
    }> = [];
    for (const seed of NEWS_SEEDS) {
      const news = await fetchScienceNews(ctx, {
        query: seed.query,
        limit: perSeed,
        startPublishedDate,
      });
      for (const article of news) {
        const key = article.url.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push({ article, topicLabel: seed.label });
        if (collected.length >= NEWS_TOTAL_CAP) break;
      }
      if (collected.length >= NEWS_TOTAL_CAP) break;
    }

    if (collected.length === 0) {
      return { fetched: 0, inserted: 0, updated: 0 };
    }

    // Read each article page for a clean full-text body (readability extractor),
    // falling back to Exa's raw text when extraction yields too little.
    const previews = await Promise.all(
      collected.map(({ article }) => fetchArticlePreview(article.url)),
    );

    const items = collected.map(({ article, topicLabel }, index) => {
      const preview = previews[index];
      const articleText = preview.articleText ?? article.articleText;
      return {
        kind: "news" as const,
        title: article.title,
        summary: article.summary,
        tldr: firstSentence(article.summary),
        url: article.url,
        imageUrl: article.imageUrl ?? preview.imageUrl,
        ...(articleText ? { articleText } : {}),
        provider: "exa_news" as const,
        sourceLabel: article.sourceLabel,
        topics: [topicLabel],
        trendScore: 0,
        publishedAt: article.publishedAt ?? now,
        dedupeKey: `news:${article.url.slice(0, 200)}`,
        lastSeenAt: now,
        createdAt: now,
      };
    });

    const result: { inserted: number; updated: number } = await ctx.runMutation(
      internal.feed.upsertFeedItems,
      { items },
    );
    return { fetched: items.length, ...result };
  },
});

function firstSentence(text: string): string | undefined {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  const match = clean.match(/^.*?[.!?](?=\s|$)/);
  const value = match ? match[0] : clean;
  return value.length > 200 ? `${value.slice(0, 199).trimEnd()}…` : value;
}
