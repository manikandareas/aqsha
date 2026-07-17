/**
 * FeedHydrationService — lane ingest feed (P4), dipanggil worker BullMQ `feed-hydration`
 * (proses terpisah, ganti cron 3h Convex `hydrateCycle`). Business logic di sini; worker
 * hanya dispatch. Lane: OpenAlex (papers). Provider lib di `feed/openAlex`.
 */
import type { Db } from "@aqsha/db";
import { fetchOpenAlexWorks, workIdentifiers } from "./feed/openAlex";
import { paperToFeedInput } from "./feed/model";
import { upsertFeedItems } from "./feed/write";
import { PaperCacheService } from "./paper-cache.service";
import { enqueue, FEED_QUEUES } from "./clients/queue";

// ── konstanta lane ───────────────────────────────────────────────────────────
const TRENDING_LIMIT = 24;

/** Stagger fan-out lane (ms) — port V1 HYDRATE_STAGGER (3h cron orchestrator). */
const HYDRATE_STAGGER: Record<FeedHydrationLane, number> = {
  refreshTrendingPapers: 0,
};

export type RefreshResult = { fetched: number; written: number };

export const FEED_HYDRATION_LANES = ["refreshTrendingPapers"] as const;
export type FeedHydrationLane = (typeof FEED_HYDRATION_LANES)[number];

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

  /** Jalankan satu lane by id (dispatch worker). */
  async runLane(db: Db, lane: FeedHydrationLane, limit?: number): Promise<void> {
    switch (lane) {
      case "refreshTrendingPapers":
        await this.refreshTrendingPapers(db, { limit });
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
