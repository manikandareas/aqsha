import { type ConnectionOptions, Queue } from "bullmq";

/**
 * Producer-side BullMQ (enqueue dari service layer). Connection di-parse dari
 * `REDIS_URL` jadi options-object (bukan instance ioredis) supaya BullMQ memakai
 * ioredis bundled-nya sendiri — menghindari clash dua versi ioredis. BullMQ wajib
 * `maxRetriesPerRequest: null`. Worker (consumer) di `apps/api-v2/src/workers`
 * reuse `getQueueConnection()` ini. Default job opts (attempt-guard + backoff)
 * tinggal di sini supaya semua caller seragam.
 */
export const ARTIFACT_QUEUES = {
  urlIngestion: "url-ingestion",
  paperEnrichment: "paper-enrichment",
  artifactCleanup: "artifact-cleanup",
} as const;

export type ArtifactQueueName = (typeof ARTIFACT_QUEUES)[keyof typeof ARTIFACT_QUEUES];

let connection: ConnectionOptions | null = null;
const queues = new Map<ArtifactQueueName, Queue>();

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

function getQueue(name: ArtifactQueueName): Queue {
  const existing = queues.get(name);
  if (existing) return existing;
  const queue = new Queue(name, { connection: getQueueConnection() });
  queues.set(name, queue);
  return queue;
}

export async function enqueue<T extends Record<string, unknown>>(
  name: ArtifactQueueName,
  data: T,
  opts?: { jobId?: string },
): Promise<void> {
  await getQueue(name).add(name, data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 20_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
    ...(opts?.jobId ? { jobId: opts.jobId } : {}),
  });
}
