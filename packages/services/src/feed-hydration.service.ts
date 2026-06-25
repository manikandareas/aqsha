/**
 * FeedHydrationService — lane ingest feed (P4), dipanggil worker BullMQ `feed-hydration`
 * (proses terpisah, ganti cron 3h Convex `hydrateCycle`). Business logic di sini; worker
 * hanya dispatch. Lane: OpenAlex (papers), GDELT (topics), Google News (RSS + enrich),
 * FactCheck (claims). Provider lib di `feed/providers/*` + `feed/openAlex`.
 */
import type { Db } from "@aqsha/db";
import { FeedRepo } from "@aqsha/db";
import { fetchOpenAlexWorks, workIdentifiers } from "./feed/openAlex";
import { fetchGdeltTopicTimeline, summarizeTimeline } from "./feed/providers/gdelt";
import {
  buildGoogleNewsFeedInputs,
  dedupeGoogleNewsItems,
  fetchGoogleNews,
  type GoogleNewsItem,
  googleNewsSearchUrl,
  googleNewsTopicUrl,
} from "./feed/providers/googleNews";
import { resolvePublisherUrl } from "./feed/providers/googleNewsDecode";
import {
  deriveClaimTopics,
  FACTCHECK_SEED_QUERIES,
  type FactCheckClaim,
  searchFactCheckClaims,
} from "./feed/providers/factCheck";
import { type ArticlePreview, fetchArticlePreview } from "./papers/articlePreview";
import { deriveSearchText, type FeedClaim, type FeedItemInput, paperToFeedInput } from "./feed/model";
import { upsertFeedItems } from "./feed/write";
import { PaperCacheService } from "./paper-cache.service";
import { enqueue, FEED_QUEUES } from "./clients/queue";

// ── konstanta lane (port V1) ─────────────────────────────────────────────────
const TRENDING_LIMIT = 24;
const TOPIC_TIMESPAN = "3m";
const GDELT_REQUEST_SPACING_MS = 5_200;
const GOOGLE_NEWS_PER_SEED = 6;
const GOOGLE_NEWS_TOTAL_CAP = 16;
const GOOGLE_NEWS_SEED_SPACING_MS = 1_500;
const GOOGLE_NEWS_ENRICH_BATCH = 6;
const GOOGLE_NEWS_ENRICH_SPACING_MS = 1_200;
const CLAIM_TOTAL_CAP = 28;
const SUPPORTING_PAPER_LOOKUPS = 12;
const SUPPORTING_PAPERS_PER_CLAIM = 4;

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
const GOOGLE_NEWS_SEARCH_SEEDS: Array<{ label: string; query: string }> = [
  { label: "Kesehatan", query: "kesehatan OR medis OR penyakit when:7d -hoaks" },
  { label: "Sains", query: "sains OR penelitian OR riset when:7d" },
  { label: "Lingkungan", query: "lingkungan OR iklim OR energi when:7d" },
];
const GOOGLE_NEWS_TOPIC_SEEDS: Array<{ label: string; topic: string }> = [
  { label: "Sains", topic: "SCIENCE" },
  { label: "Kesehatan", topic: "HEALTH" },
];

/** Stagger fan-out lane (ms) — port V1 HYDRATE_STAGGER (3h cron orchestrator). */
const HYDRATE_STAGGER: Record<FeedHydrationLane, number> = {
  refreshTrendingPapers: 0,
  refreshTrendingTopics: 20 * 60_000,
  refreshGoogleNews: 40 * 60_000,
  refreshFactCheckClaims: 60 * 60_000,
  enrichGoogleNewsArticles: 100 * 60_000,
};

export type RefreshResult = { fetched: number; written: number };

export const FEED_HYDRATION_LANES = [
  "refreshTrendingPapers",
  "refreshTrendingTopics",
  "refreshGoogleNews",
  "refreshFactCheckClaims",
  "enrichGoogleNewsArticles",
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

function parseDateMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
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

  /** Trending topics GDELT (pacing 5.2s) → feed kind=topic (+ sparkline). */
  async refreshTrendingTopics(db: Db): Promise<RefreshResult> {
    const now = Date.now();
    const inputs: FeedItemInput[] = [];
    for (let i = 0; i < TOPIC_SEEDS.length; i += 1) {
      const seed = TOPIC_SEEDS[i]!;
      if (i > 0) await sleep(GDELT_REQUEST_SPACING_MS); // hormati ~1 req/5s GDELT
      const timeline = await fetchGdeltTopicTimeline({ query: seed.query, timespan: TOPIC_TIMESPAN });
      const { sparkline, trendScore } = summarizeTimeline(timeline.values);
      if (sparkline.length === 0 || trendScore <= 0) continue;
      inputs.push({
        kind: "topic",
        title: seed.label,
        summary: `Volume pemberitaan Indonesia untuk "${seed.label}" dalam 3 bulan terakhir.`,
        url: `https://news.google.com/search?q=${encodeURIComponent(seed.query)}&hl=id&gl=ID`,
        provider: "gdelt",
        sourceLabel: "GDELT",
        topics: [seed.label],
        trendScore,
        sparkline,
        publishedAt: now,
        dedupeKey: `topic:gdelt:${seed.label}`,
      });
    }
    if (inputs.length === 0) return { fetched: 0, written: 0 };
    await upsertFeedItems(db, inputs, now);
    return { fetched: inputs.length, written: inputs.length };
  },

  /** News Google News RSS (spacing 1.5s) → dedupe → feed kind=news (summary kosong). */
  async refreshGoogleNews(db: Db, args?: { perSeed?: number }): Promise<RefreshResult> {
    const now = Date.now();
    const perSeed = Math.min(args?.perSeed ?? GOOGLE_NEWS_PER_SEED, 12);
    const seeds: Array<{ label: string; url: string }> = [
      ...GOOGLE_NEWS_SEARCH_SEEDS.map((s) => ({ label: s.label, url: googleNewsSearchUrl(s.query) })),
      ...GOOGLE_NEWS_TOPIC_SEEDS.map((s) => ({ label: s.label, url: googleNewsTopicUrl(s.topic) })),
    ];
    const bySeed: Array<{ label: string; items: GoogleNewsItem[] }> = [];
    for (let i = 0; i < seeds.length; i += 1) {
      if (i > 0) await sleep(GOOGLE_NEWS_SEED_SPACING_MS);
      try {
        const items = await fetchGoogleNews({ url: seeds[i]!.url, limit: perSeed });
        bySeed.push({ label: seeds[i]!.label, items });
      } catch {
        bySeed.push({ label: seeds[i]!.label, items: [] });
      }
    }
    const collected = dedupeGoogleNewsItems(bySeed, GOOGLE_NEWS_TOTAL_CAP);
    if (collected.length === 0) return { fetched: 0, written: 0 };
    const inputs = buildGoogleNewsFeedInputs(collected, now);
    await upsertFeedItems(db, inputs, now);
    return { fetched: inputs.length, written: inputs.length };
  },

  /** Enrich news: resolve publisher URL + ekstrak body/image. Patch never-overwrite + searchText. */
  async enrichGoogleNewsArticles(db: Db, args?: { limit?: number }): Promise<{ scanned: number; patched: number }> {
    const limit = Math.min(args?.limit ?? GOOGLE_NEWS_ENRICH_BATCH, 20);
    const targets = await FeedRepo.listNewsNeedingEnrichment(db, limit);
    if (targets.length === 0) return { scanned: 0, patched: 0 };

    let patched = 0;
    for (let i = 0; i < targets.length; i += 1) {
      if (i > 0) await sleep(GOOGLE_NEWS_ENRICH_SPACING_MS);
      const target = targets[i]!;
      // Selalu catat attempt (walau gagal) supaya item konvergen keluar dari sweep.
      const patch: {
        enrichAttempts: number;
        resolvedUrl?: string;
        articleText?: string;
        imageUrl?: string;
        summary?: string;
        tldr?: string;
        searchText?: string;
      } = { enrichAttempts: (target.enrichAttempts ?? 0) + 1 };

      const resolvedUrl = await resolvePublisherUrl(target.url);
      if (resolvedUrl) {
        patch.resolvedUrl = resolvedUrl;
        const preview: ArticlePreview = await fetchArticlePreview(resolvedUrl);
        if (preview.imageUrl && !target.imageUrl) patch.imageUrl = preview.imageUrl;
        if (preview.articleText) {
          patch.articleText = preview.articleText;
          patched += 1;
          if (target.tldr === null) patch.tldr = firstSentence(preview.articleText);
          if (target.summary.trim().length === 0) {
            const summary = leadFromArticle(preview.articleText);
            patch.summary = summary;
            // Recompute searchText (RSS ingest summary kosong → tadinya title+topics saja).
            patch.searchText = deriveSearchText({
              title: target.title,
              summary,
              topics: target.topics,
            });
          }
        }
      }
      await FeedRepo.applyEnrichmentPatch(db, target.id, patch);
    }
    return { scanned: targets.length, patched };
  },

  /** Fact-check claims (Google FactCheck) → preview + grounding OpenAlex → feed kind=claim. */
  async refreshFactCheckClaims(
    db: Db,
    args?: { maxAgeDays?: number; pageSize?: number },
  ): Promise<RefreshResult> {
    const maxAgeDays = args?.maxAgeDays ?? 30;
    const pageSize = args?.pageSize ?? 20;

    const seen = new Set<string>();
    const claims: FactCheckClaim[] = [];
    for (const query of FACTCHECK_SEED_QUERIES) {
      const batch = await searchFactCheckClaims({ query, languageCode: "id", maxAgeDays, pageSize });
      for (const claim of batch) {
        const key = (claim.reviewUrl ?? claim.text).trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        claims.push(claim);
        if (claims.length >= CLAIM_TOTAL_CAP) break;
      }
      if (claims.length >= CLAIM_TOTAL_CAP) break;
    }
    if (claims.length === 0) return { fetched: 0, written: 0 };

    const previews = await Promise.all(
      claims.map((c) => (c.reviewUrl ? fetchArticlePreview(c.reviewUrl) : Promise.resolve({} as ArticlePreview))),
    );

    const now = Date.now();
    const inputs: FeedItemInput[] = [];
    for (let i = 0; i < claims.length; i += 1) {
      const claim = claims[i]!;
      let supportingPaperKeys: string[] | undefined;
      if (i < SUPPORTING_PAPER_LOOKUPS) {
        supportingPaperKeys = await this.collectSupportingPapers(db, claim.text, now);
      }
      const publishedAt = claim.reviewedAt ?? parseDateMs(claim.claimDate) ?? now;
      const reviewUrl =
        claim.reviewUrl ??
        `https://toolbox.google.com/factcheck/explorer/search/${encodeURIComponent(claim.text)}`;
      const primaryClaim: FeedClaim = {
        claim: claim.text,
        verdict: claim.verdict,
        verdictSource: "google_factcheck",
        verdictBy: "human",
        verdictLabelRaw: claim.verdictLabelRaw,
        ...(claim.publisher !== undefined ? { publisher: claim.publisher } : {}),
        ...(claim.reviewUrl !== undefined ? { reviewUrl: claim.reviewUrl } : {}),
        ...(claim.reviewedAt !== undefined ? { reviewedAt: claim.reviewedAt } : {}),
        ...(claim.reviewTitle !== undefined ? { evidence: claim.reviewTitle } : {}),
        ...(claim.severity !== undefined ? { severity: claim.severity } : {}),
        ...(claim.claimant !== undefined ? { claimant: claim.claimant } : {}),
        ...(parseDateMs(claim.claimDate) !== undefined ? { claimDate: parseDateMs(claim.claimDate) } : {}),
        ...(supportingPaperKeys !== undefined ? { supportingPaperKeys } : {}),
      };
      inputs.push({
        kind: "claim",
        title: claim.text,
        summary: claim.reviewTitle ?? claim.text,
        tldr: firstSentence(claim.reviewTitle ?? claim.text),
        url: reviewUrl,
        imageUrl: previews[i]?.imageUrl,
        articleText: previews[i]?.articleText,
        provider: "google_factcheck",
        sourceLabel: claim.publisher ?? "Cek Fakta",
        topics: deriveClaimTopics(claim.text),
        trendScore: 0,
        publishedAt,
        dedupeKey: `claim:${(claim.reviewUrl ?? claim.text).trim().toLowerCase().slice(0, 200)}`,
        primaryClaim,
      });
    }
    await upsertFeedItems(db, inputs, now);
    return { fetched: claims.length, written: inputs.length };
  },

  /** Grounding klaim ke literatur OpenAlex (bounded) → cache + return key. */
  async collectSupportingPapers(db: Db, claimText: string, now: number): Promise<string[] | undefined> {
    try {
      const { papers } = await fetchOpenAlexWorks({
        query: claimText.slice(0, 240),
        limit: SUPPORTING_PAPERS_PER_CLAIM,
        now,
      });
      if (papers.length === 0) return undefined;
      await PaperCacheService.upsert(db, papers, now);
      return papers.map((p) => p.key);
    } catch {
      return undefined;
    }
  },

  /** Jalankan satu lane by id (dispatch worker). */
  async runLane(db: Db, lane: FeedHydrationLane, limit?: number): Promise<void> {
    switch (lane) {
      case "refreshTrendingPapers":
        await this.refreshTrendingPapers(db, { limit });
        break;
      case "refreshTrendingTopics":
        await this.refreshTrendingTopics(db);
        break;
      case "refreshGoogleNews":
        await this.refreshGoogleNews(db, { perSeed: limit });
        break;
      case "refreshFactCheckClaims":
        await this.refreshFactCheckClaims(db);
        break;
      case "enrichGoogleNewsArticles":
        await this.enrichGoogleNewsArticles(db, { limit });
        break;
    }
  },

  /**
   * Fan-out 5 lane sebagai job terpisah dengan stagger (ganti hydrateCycle scheduler.runAfter).
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
