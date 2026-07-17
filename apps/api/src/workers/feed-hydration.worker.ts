import { FeedHydrationService, type FeedHydrationLane } from "@aqsha/services";
import * as Sentry from "@sentry/bun";
import type { Job } from "bullmq";
import { getDb } from "../clients/db";
import { logger } from "../lib/log";

/**
 * Worker feed-hydration (ganti cron 3h Convex `hydrateCycle`). Dua jenis job:
 *  - `cycle`: di-fire repeatable cron (setiap 3 jam) → fan-out lane dengan stagger.
 *  - `lane`: satu lane provider (OpenAlex papers — berita tidak lagi dihidrasi).
 * Business logic di `FeedHydrationService`; worker hanya dispatch + log.
 *
 * Cron monitoring (Sentry): tiap `cycle` dibungkus `Sentry.withMonitor` → check-in
 * in-progress/ok/error + upsert monitor `feed-hydration-cycle` (schedule crontab yang sama dengan
 * `registerRepeatable`). Sentry lalu bisa alert bila siklus GAGAL BERJALAN (bukan hanya gagal saat
 * berjalan). No-op tanpa `SENTRY_DSN_API` — callback tetap dijalankan apa adanya.
 */
export type FeedHydrationJob =
  | { kind: "cycle" }
  | { kind: "lane"; lane: FeedHydrationLane; limit?: number };

export async function processFeedHydration(job: Job<FeedHydrationJob>): Promise<void> {
  const { db } = getDb();
  if (job.data.kind === "cycle") {
    await Sentry.withMonitor(
      "feed-hydration-cycle",
      async () => {
        const result = await FeedHydrationService.enqueueHydrationLanes();
        // `notable` → ter-bridge ke Sentry Logs sebagai bukti siklus jalan + jumlah lane terjadwal.
        logger.info(
          { notable: true, scheduled: result.scheduled },
          "feed_hydration_cycle_fanout",
        );
      },
      {
        schedule: { type: "crontab", value: "0 */3 * * *" },
        checkinMargin: 10, // menit toleransi telat mulai
        maxRuntime: 20, // menit; fan-out enqueue harusnya detik, bukan menit
        timezone: "Etc/UTC",
      },
    );
    return;
  }
  const { lane, limit } = job.data;
  await FeedHydrationService.runLane(db, lane, limit);
  logger.info({ lane }, "feed_hydration_lane_done");
}
