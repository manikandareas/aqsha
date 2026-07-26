import {
  ACCOUNT_QUEUES,
  ARTIFACT_QUEUES,
  assertEmbeddingEnabled,
  CHAT_QUEUES,
  FEED_QUEUES,
  getQueueConnection,
  INTEGRATION_QUEUES,
  registerRepeatable,
} from "@aqsha/services";
import { Worker } from "bullmq";
import { logger } from "../lib/log";
import { captureException, initSentry } from "../lib/sentry";

// Sentry sedini mungkin (no-op tanpa SENTRY_DSN_API) supaya kegagalan boot pun tertangkap.
initSentry("worker");

// Fail-fast (D1): worker meng-index dokumen (artifact-indexing, url-ingestion) via embedding.
// Kredensial yang hilang digagalkan saat boot, bukan job gagal senyap.
assertEmbeddingEnabled();
import { type AccountDeletionJob, processAccountDeletion } from "./account-deletion.worker";
import { type ArtifactCleanupJob, processArtifactCleanup } from "./artifact-cleanup.worker";
import { type ArtifactIndexingJob, processArtifactIndexing } from "./artifact-indexing.worker";
import { type FeedHydrationJob, processFeedHydration } from "./feed-hydration.worker";
import { type IntegrationSyncJob, processIntegrationSync } from "./integration-sync.worker";
import { type LibraryIngestJob, processLibraryIngest } from "./library-ingest.worker";
import { type PaperEnrichmentJob, processPaperEnrichment } from "./paper-enrichment.worker";
import { type ThreadTitleJob, processThreadTitle } from "./thread-title.worker";
import { type UrlIngestionJob, processUrlIngestion } from "./url-ingestion.worker";

/**
 * Entrypoint worker BullMQ (proses TERPISAH dari Elysia server). Koneksi ioredis
 * dedicated (`maxRetriesPerRequest:null`) di-share lewat `getQueueConnection()`.
 * Jalankan: `bun run dev:worker` (atau container `worker` di prod). attempt-guard + backoff
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
  new Worker<ArtifactIndexingJob>(ARTIFACT_QUEUES.artifactIndexing, processArtifactIndexing, {
    connection,
    concurrency: CONCURRENCY,
  }),
  new Worker<PaperEnrichmentJob>(ARTIFACT_QUEUES.paperEnrichment, processPaperEnrichment, {
    connection,
    concurrency: CONCURRENCY,
  }),
  // Concurrency 2 — tiap job memanggil Crossref/OpenAlex dan mungkin mengunduh PDF.
  new Worker<LibraryIngestJob>(ARTIFACT_QUEUES.libraryIngest, processLibraryIngest, {
    connection,
    concurrency: 2,
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
  new Worker<AccountDeletionJob>(ACCOUNT_QUEUES.accountDeletion, processAccountDeletion, {
    connection,
    concurrency: 2,
  }),
  // Integration sync: concurrency 1 — pace panggilan API provider eksternal (Mendeley/Zotero).
  new Worker<IntegrationSyncJob>(INTEGRATION_QUEUES.integrationSync, processIntegrationSync, {
    connection,
    concurrency: 1,
  }),
];

for (const w of workers) {
  const log = logger.child({ worker: w.name });
  w.on("failed", (job, err) => {
    // `failed` fires on EVERY attempt, including intermediate retries — only the TERMINAL failure
    // (attempts exhausted; enqueue sets `attempts: 3`) is a real incident. So: intermediate retries
    // log at `warn` (searchable, "retry mendekati habis" per policy §5.1) and terminal failure logs at
    // `error` + raises ONE Sentry exception. Without terminal-gating a job that succeeds on retry would
    // still raise an incident, and a terminally-failing job would report N times.
    const attempts = job?.opts?.attempts ?? 1;
    const attemptsMade = job?.attemptsMade ?? 0;
    const terminal = Boolean(job && attemptsMade >= attempts);
    const ctx = { jobId: job?.id ?? null, attemptsMade, attempts, err };
    if (terminal) {
      log.error(ctx, "job_failed");
      captureException(err, { queue: w.name, jobId: job?.id ?? null, attemptsMade });
    } else {
      log.warn(ctx, "job_retry");
    }
  });
  w.on("ready", () => log.info("worker_ready"));
}
logger.info({ queues: workers.length, notable: true }, "workers_started");

// Cron feed-hydration 3h (ganti `internal.feed.hydrateCycle` Convex). Idempotent by jobId.
registerRepeatable(FEED_QUEUES.feedHydration, { kind: "cycle" }, {
  pattern: "0 */3 * * *",
  jobId: "feed-hydration-cycle",
})
  .then(() => logger.info({ pattern: "0 */3 * * *", notable: true }, "cron_feed_hydration_registered"))
  .catch((err) => logger.error({ err }, "cron_feed_hydration_register_failed"));

async function shutdown() {
  logger.info("workers_shutting_down");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
