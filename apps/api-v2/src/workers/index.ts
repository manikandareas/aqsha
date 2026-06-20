import { ARTIFACT_QUEUES, getQueueConnection } from "@aqsha/services";
import { Worker } from "bullmq";
import { type ArtifactCleanupJob, processArtifactCleanup } from "./artifact-cleanup.worker";
import { type PaperEnrichmentJob, processPaperEnrichment } from "./paper-enrichment.worker";
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
];

for (const w of workers) {
  w.on("failed", (job, err) =>
    console.error(`[worker:${w.name}] job ${job?.id ?? "?"} failed`, err),
  );
  w.on("ready", () => console.log(`[worker:${w.name}] ready`));
}
console.log(`[workers] started ${workers.length} queue(s)`);

async function shutdown() {
  console.log("[workers] shutting down…");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
