import {
  ACCOUNT_QUEUES,
  ARTIFACT_QUEUES,
  CHAT_QUEUES,
  EXPLORE_QUEUES,
  FEED_QUEUES,
  getQueueConnection,
  registerRepeatable,
} from "@aqsha/services";
import { Worker } from "bullmq";
import { logger } from "../lib/log";
import { type AccountDeletionJob, processAccountDeletion } from "./account-deletion.worker";
import { type ArtifactCleanupJob, processArtifactCleanup } from "./artifact-cleanup.worker";
import { type ExploreAnalysisJob, processExploreAnalysis } from "./explore-analysis.worker";
import { type FeedHydrationJob, processFeedHydration } from "./feed-hydration.worker";
import { type PaperEnrichmentJob, processPaperEnrichment } from "./paper-enrichment.worker";
import { type ReconcileStaleJob, processReconcileStale } from "./reconcile-stale.worker";
import { type ThreadTitleJob, processThreadTitle } from "./thread-title.worker";
import { type UrlIngestionJob, processUrlIngestion } from "./url-ingestion.worker";

/**
 * Entrypoint worker BullMQ (proses TERPISAH dari Elysia server). Koneksi ioredis
 * dedicated (`maxRetriesPerRequest:null`) di-share lewat `getQueueConnection()`.
 * Jalankan: `bun run dev:worker` (atau systemd di prod). attempt-guard + backoff
 * di-set producer (`enqueue`).
 */
const connection = getQueueConnection();
const CONCURRENCY = 3;

const workers = [
  new Worker<ArtifactCleanupJob>(ARTIFACT_QUEUES.artifactCleanup, processArtifactCleanup, {
    connection,
    concurrency: CONCURRENCY,
  }),
  new Worker<UrlIngestionJob>(ARTIFACT_QUEUES.urlIngestion, processUrlIngestion, {
    connection,
    concurrency: CONCURRENCY,
  }),
  new Worker<PaperEnrichmentJob>(ARTIFACT_QUEUES.paperEnrichment, processPaperEnrichment, {
    connection,
    concurrency: CONCURRENCY,
  }),
  // Feed hydration: concurrency 1 — lane provider di-pace (hindari hammer external API).
  new Worker<FeedHydrationJob>(FEED_QUEUES.feedHydration, processFeedHydration, {
    connection,
    concurrency: 1,
  }),
  new Worker<ThreadTitleJob>(CHAT_QUEUES.threadTitle, processThreadTitle, {
    connection,
    concurrency: CONCURRENCY,
  }),
  // Reconciler zombie (Phase 5): concurrency 1 — sweep berkala ringan, tak perlu paralel.
  new Worker<ReconcileStaleJob>(CHAT_QUEUES.reconcileStale, processReconcileStale, {
    connection,
    concurrency: 1,
  }),
  new Worker<AccountDeletionJob>(ACCOUNT_QUEUES.accountDeletion, processAccountDeletion, {
    connection,
    concurrency: 2,
  }),
  // Explore analysis: concurrency 2 — tiap job = fetch OpenAlex/arXiv + 1 LLM call (pace API).
  new Worker<ExploreAnalysisJob>(EXPLORE_QUEUES.exploreAnalysis, processExploreAnalysis, {
    connection,
    concurrency: 2,
  }),
];

for (const w of workers) {
  const log = logger.child({ worker: w.name });
  w.on("failed", (job, err) => log.error({ jobId: job?.id ?? null, err }, "job_failed"));
  w.on("ready", () => log.info("worker_ready"));
}
logger.info({ queues: workers.length }, "workers_started");

// Cron feed-hydration 3h (ganti `internal.feed.hydrateCycle` Convex). Idempotent by jobId.
registerRepeatable(FEED_QUEUES.feedHydration, { kind: "cycle" }, {
  pattern: "0 */3 * * *",
  jobId: "feed-hydration-cycle",
})
  .then(() => logger.info({ pattern: "0 */3 * * *" }, "cron_feed_hydration_registered"))
  .catch((err) => logger.error({ err }, "cron_feed_hydration_register_failed"));

// Cron reconciler zombie (Phase 5, fix E) — tiap jam tandai thread `streaming` basi → `failed`
// + event terminal sintetik (composer unlock). Idempotent by jobId.
registerRepeatable(CHAT_QUEUES.reconcileStale, { kind: "cycle" }, {
  pattern: "0 * * * *",
  jobId: "reconcile-stale-threads-cycle",
})
  .then(() => logger.info({ pattern: "0 * * * *" }, "cron_reconcile_stale_registered"))
  .catch((err) => logger.error({ err }, "cron_reconcile_stale_register_failed"));

async function shutdown() {
  logger.info("workers_shutting_down");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
