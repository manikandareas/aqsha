import { FeedHydrationService, type FeedHydrationLane } from "@aqsha/services";
import type { Job } from "bullmq";
import { getDb } from "../clients/db";

/**
 * Worker feed-hydration (ganti cron 3h Convex `hydrateCycle`). Dua jenis job:
 *  - `cycle`: di-fire repeatable cron (setiap 3 jam) → fan-out 5 lane dengan stagger.
 *  - `lane`: satu lane provider (OpenAlex/GDELT/GoogleNews/FactCheck/enrich).
 * Business logic di `FeedHydrationService`; worker hanya dispatch + log.
 */
export type FeedHydrationJob =
  | { kind: "cycle" }
  | { kind: "lane"; lane: FeedHydrationLane; limit?: number };

export async function processFeedHydration(job: Job<FeedHydrationJob>): Promise<void> {
  const { db } = getDb();
  if (job.data.kind === "cycle") {
    const result = await FeedHydrationService.enqueueHydrationLanes();
    console.log("[worker:feed-hydration] cycle fan-out", result);
    return;
  }
  const { lane, limit } = job.data;
  await FeedHydrationService.runLane(db, lane, limit);
  console.log(`[worker:feed-hydration] lane ${lane} selesai`);
}
