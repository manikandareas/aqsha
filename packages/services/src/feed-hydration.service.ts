/**
 * FeedHydrationService — lane ingest feed (P4), dipanggil worker BullMQ `feed-hydration`
 * (proses terpisah, ganti cron 3h Convex `hydrateCycle`). Business logic di sini; worker
 * hanya dispatch. Lane: OpenAlex (papers), GDELT (news + enrich). Provider lib di
 * `feed/providers/*` + `feed/openAlex`.
 */
import type { Db } from "@aqsha/db";
import { FeedRepo } from "@aqsha/db";
import { fetchOpenAlexWorks, workIdentifiers } from "./feed/openAlex";
import {
  buildGdeltFeedInputs,
  dedupeGdeltItems,
  fetchGdelt,
  gdeltArtListUrl,
  type GdeltItem,
} from "./feed/providers/gdelt";
import { GDELT_TOPIC_SEEDS, gdeltSeedQuery } from "./feed/gdeltSeeds";
import { type ArticlePreview, fetchArticlePreview } from "./papers/articlePreview";
import { deriveSearchText, paperToFeedInput } from "./feed/model";
import { upsertFeedItems } from "./feed/write";
import { PaperCacheService } from "./paper-cache.service";
import { enqueue, FEED_QUEUES } from "./clients/queue";
import { generateText } from "ai";
import { fastModel } from "./clients/fast-model";

// ── konstanta lane ───────────────────────────────────────────────────────────
const TRENDING_LIMIT = 24;
const GDELT_PER_SEED = 25;
const GDELT_TOTAL_CAP = 24;
const GDELT_TIMESPAN = "3d";
// GDELT soft-throttle "1 request / 5 detik" → spacing aman 6s (worker concurrency = 1).
const GDELT_SEED_SPACING_MS = 6_000;
const NEWS_ENRICH_BATCH = 6;
const NEWS_ENRICH_SPACING_MS = 1_200;

/** Stagger fan-out lane (ms) — port V1 HYDRATE_STAGGER (3h cron orchestrator). */
const HYDRATE_STAGGER: Record<FeedHydrationLane, number> = {
  refreshTrendingPapers: 0,
  refreshGdeltNews: 20 * 60_000,
  enrichNewsArticles: 60 * 60_000,
};

export type RefreshResult = { fetched: number; written: number };

export const FEED_HYDRATION_LANES = [
  "refreshTrendingPapers",
  "refreshGdeltNews",
  "enrichNewsArticles",
] as const;
export type FeedHydrationLane = (typeof FEED_HYDRATION_LANES)[number];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstSentence(text: string): string | undefined {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  const match = clean.match(/^.*?[.!?](?=\s|$)/);
  const value = match ? match[0] : clean;
  return value.length > 200 ? `${value.slice(0, 199).trimEnd()}…` : value;
}

function leadFromArticle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 280 ? `${clean.slice(0, 279).trimEnd()}…` : clean;
}

const TLDR_MAX_INPUT_CHARS = 4_000;

/**
 * TL;DR 2–3 kalimat Bahasa Indonesia dari badan artikel (fast-model murah, env-configurable).
 * Best-effort: tanpa API key / gagal → `undefined`, pemanggil fallback ke firstSentence.
 */
async function summarizeArticleId(title: string, articleText: string): Promise<string | undefined> {
  try {
    const { text } = await generateText({
      model: fastModel(),
      prompt:
        "Ringkas artikel berita berikut menjadi 2–3 kalimat padat dalam Bahasa Indonesia. " +
        "Fokus pada inti peristiwa atau temuan; hindari kalimat pembuka basa-basi. " +
        "Balas HANYA ringkasannya, tanpa awalan seperti 'Ringkasan:'.\n\n" +
        `Judul: ${title}\n\nIsi:\n${articleText.slice(0, TLDR_MAX_INPUT_CHARS)}`,
    });
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > 0 ? clean : undefined;
  } catch {
    return undefined;
  }
}

export const FeedHydrationService = {
  /** Trending papers OpenAlex → cache explore_papers + materialize feed kind=paper. */
  async refreshTrendingPapers(db: Db, args?: { limit?: number }): Promise<RefreshResult> {
    const limit = Math.min(args?.limit ?? TRENDING_LIMIT, 50);
    const { papers, works } = await fetchOpenAlexWorks({ query: "", limit, includeRetracted: true });
    if (papers.length === 0) return { fetched: 0, written: 0 };
    const retractedIds = new Set<string>();
    for (const work of works) {
      if (work.is_retracted) for (const id of workIdentifiers(work)) retractedIds.add(id);
    }
    const now = Date.now();
    await PaperCacheService.upsert(db, papers, now);
    const inputs = papers.map((paper) => paperToFeedInput(paper, retractedIds));
    await upsertFeedItems(db, inputs, now);
    return { fetched: papers.length, written: inputs.length };
  },

  /** News GDELT ArtList (spacing 6s, semi-global seed) → dedupe → feed kind=news (summary kosong). */
  async refreshGdeltNews(db: Db, args?: { perSeed?: number }): Promise<RefreshResult> {
    const now = Date.now();
    const perSeed = Math.min(args?.perSeed ?? GDELT_PER_SEED, 250);
    const bySeed: Array<{ label: string; topics: string[]; items: GdeltItem[] }> = [];
    for (let i = 0; i < GDELT_TOPIC_SEEDS.length; i += 1) {
      const seed = GDELT_TOPIC_SEEDS[i]!;
      if (i > 0) await sleep(GDELT_SEED_SPACING_MS);
      try {
        const url = gdeltArtListUrl({
          query: gdeltSeedQuery(seed),
          timespan: GDELT_TIMESPAN,
          maxrecords: perSeed,
        });
        const items = await fetchGdelt({ url, limit: perSeed });
        bySeed.push({ label: seed.label, topics: seed.topics, items });
      } catch {
        bySeed.push({ label: seed.label, topics: seed.topics, items: [] });
      }
    }
    const collected = dedupeGdeltItems(bySeed, GDELT_TOTAL_CAP);
    if (collected.length === 0) return { fetched: 0, written: 0 };
    const inputs = buildGdeltFeedInputs(collected, now);
    await upsertFeedItems(db, inputs, now);
    return { fetched: inputs.length, written: inputs.length };
  },

  /** Enrich news: ekstrak body/image dari URL publisher (GDELT langsung). Patch never-overwrite + searchText. */
  async enrichNewsArticles(db: Db, args?: { limit?: number }): Promise<{ scanned: number; patched: number }> {
    const limit = Math.min(args?.limit ?? NEWS_ENRICH_BATCH, 20);
    const targets = await FeedRepo.listNewsNeedingEnrichment(db, limit);
    if (targets.length === 0) return { scanned: 0, patched: 0 };

    let patched = 0;
    for (let i = 0; i < targets.length; i += 1) {
      if (i > 0) await sleep(NEWS_ENRICH_SPACING_MS);
      const target = targets[i]!;
      // Selalu catat attempt (walau gagal) supaya item konvergen keluar dari sweep.
      const patch: {
        enrichAttempts: number;
        articleText?: string;
        imageUrl?: string;
        summary?: string;
        tldr?: string;
        searchText?: string;
      } = { enrichAttempts: (target.enrichAttempts ?? 0) + 1 };

      // GDELT memberi URL publisher langsung → tanpa resolve redirect.
      const preview: ArticlePreview = await fetchArticlePreview(target.url);
      if (preview.imageUrl && !target.imageUrl) patch.imageUrl = preview.imageUrl;
      if (preview.articleText) {
        patch.articleText = preview.articleText;
        patched += 1;
        if (target.tldr === null) {
          patch.tldr =
            (await summarizeArticleId(target.title, preview.articleText)) ??
            firstSentence(preview.articleText);
        }
        if (target.summary.trim().length === 0) {
          const summary = leadFromArticle(preview.articleText);
          patch.summary = summary;
          // Recompute searchText (ingest summary kosong → tadinya title+topics saja).
          patch.searchText = deriveSearchText({
            title: target.title,
            summary,
            topics: target.topics,
          });
        }
      }
      await FeedRepo.applyEnrichmentPatch(db, target.id, patch);
    }
    return { scanned: targets.length, patched };
  },

  /** Jalankan satu lane by id (dispatch worker). */
  async runLane(db: Db, lane: FeedHydrationLane, limit?: number): Promise<void> {
    switch (lane) {
      case "refreshTrendingPapers":
        await this.refreshTrendingPapers(db, { limit });
        break;
      case "refreshGdeltNews":
        await this.refreshGdeltNews(db, { perSeed: limit });
        break;
      case "enrichNewsArticles":
        await this.enrichNewsArticles(db, { limit });
        break;
    }
  },

  /**
   * Fan-out lane sebagai job terpisah dengan stagger (ganti hydrateCycle scheduler.runAfter).
   * Dipakai cron 3h + admin trigger. Mengembalikan job yang ter-enqueue.
   */
  async enqueueHydrationLanes(args?: {
    lanes?: FeedHydrationLane[];
    staggerOverrideMs?: number;
  }): Promise<{
    scheduled: number;
    jobs: Array<{ lane: FeedHydrationLane; jobId: string; delayMs: number }>;
  }> {
    const lanes = args?.lanes ?? [...FEED_HYDRATION_LANES];
    const jobs: Array<{ lane: FeedHydrationLane; jobId: string; delayMs: number }> = [];
    for (const lane of lanes) {
      const delayMs = args?.staggerOverrideMs ?? HYDRATE_STAGGER[lane];
      const jobId = await enqueue(FEED_QUEUES.feedHydration, { kind: "lane", lane }, { delay: delayMs });
      jobs.push({ lane, jobId: jobId ?? "", delayMs });
    }
    return { scheduled: jobs.length, jobs };
  },
};
