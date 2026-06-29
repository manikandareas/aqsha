import { type ConnectionOptions, Queue } from "bullmq";

/**
 * Producer-side BullMQ (enqueue dari service layer). Connection di-parse dari
 * `REDIS_URL` jadi options-object (bukan instance ioredis) supaya BullMQ memakai
 * ioredis bundled-nya sendiri — menghindari clash dua versi ioredis. BullMQ wajib
 * `maxRetriesPerRequest: null`. Worker (consumer) di `apps/api/src/workers`
 * reuse `getQueueConnection()` ini. Default job opts (attempt-guard + backoff)
 * tinggal di sini supaya semua caller seragam.
 */
export const ARTIFACT_QUEUES = {
  urlIngestion: "url-ingestion",
  paperEnrichment: "paper-enrichment",
  artifactCleanup: "artifact-cleanup",
  // Index lampiran thread besar (D5) — ekstraksi+embedding di-offload dari finalize upload
  // supaya response tak terblok; file kecil tetap inline.
  artifactIndexing: "artifact-indexing",
} as const;

/** Queue feed (P4) — lane hydration discovery (ganti cron 3h Convex). */
export const FEED_QUEUES = {
  feedHydration: "feed-hydration",
} as const;

/** Queue chat (P6) — auto-title async thread (Slice 6.8). */
export const CHAT_QUEUES = {
  threadTitle: "thread-title",
} as const;

/** Queue account (P9) — cascade hard-delete data owner async (blob sweep + DELETE users). */
export const ACCOUNT_QUEUES = {
  accountDeletion: "account-deletion",
} as const;

export type ArtifactQueueName = (typeof ARTIFACT_QUEUES)[keyof typeof ARTIFACT_QUEUES];
export type FeedQueueName = (typeof FEED_QUEUES)[keyof typeof FEED_QUEUES];
export type ChatQueueName = (typeof CHAT_QUEUES)[keyof typeof CHAT_QUEUES];
export type AccountQueueName = (typeof ACCOUNT_QUEUES)[keyof typeof ACCOUNT_QUEUES];
export type QueueName = ArtifactQueueName | FeedQueueName | ChatQueueName | AccountQueueName;

let connection: ConnectionOptions | null = null;
const queues = new Map<QueueName, Queue>();

export function getQueueConnection(): ConnectionOptions {
  if (connection) return connection;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for the job queue");
  const parsed = new URL(url);
  connection = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined,
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
  return connection;
}

function getQueue(name: QueueName): Queue {
  const existing = queues.get(name);
  if (existing) return existing;
  const queue = new Queue(name, { connection: getQueueConnection() });
  queues.set(name, queue);
  return queue;
}

/** Enqueue job; mengembalikan BullMQ job id (untuk surface ke caller, mis. admin hydrate response). */
export async function enqueue<T extends Record<string, unknown>>(
  name: QueueName,
  data: T,
  opts?: { jobId?: string; delay?: number },
): Promise<string | undefined> {
  const job = await getQueue(name).add(name, data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 20_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
    ...(opts?.jobId ? { jobId: opts.jobId } : {}),
    ...(opts?.delay !== undefined ? { delay: opts.delay } : {}),
  });
  return job.id;
}

/**
 * Buang job by id. Dipakai SEBELUM re-enqueue jobId STABIL yang mungkin masih ditahan
 * BullMQ (removeOnComplete/Fail) — tanpa ini `add()` dengan jobId yang sudah ada = no-op
 * diam-diam (job tak pernah jalan lagi). Job tak ada → resolve biasa; job terkunci/aktif →
 * throw (caller yang putuskan: di-`catch` saat kita tahu tak ada job aktif).
 */
export async function removeJob(name: QueueName, jobId: string): Promise<void> {
  await getQueue(name).remove(jobId);
}

/**
 * Daftarkan repeatable job (cron) idempotent — BullMQ men-dedupe by `jobId` + pattern.
 * Dipakai cron feed-hydration (setiap 3 jam, ganti hydrateCycle Convex).
 */
export async function registerRepeatable<T extends Record<string, unknown>>(
  name: QueueName,
  data: T,
  opts: { pattern: string; jobId: string },
): Promise<void> {
  await getQueue(name).add(name, data, {
    repeat: { pattern: opts.pattern },
    jobId: opts.jobId,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  });
}
