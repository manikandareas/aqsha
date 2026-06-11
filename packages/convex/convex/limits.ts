import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

const FIVE_SECONDS = 5_000;
const THREE_SECONDS = 3_000;
const ONE_SECOND = 1_000;

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  sendMessage: {
    kind: "fixed window",
    rate: 1,
    period: FIVE_SECONDS,
    capacity: 2,
  },
  globalSendMessage: {
    kind: "token bucket",
    rate: 1_000,
    period: MINUTE,
    capacity: 1_000,
  },
  // Global token-throughput safety valve. Plan-based monthly credits
  // (see billing/catalog.ts) are the real per-user quota; this only guards the
  // whole system against provider TPM / cost spikes. Never enforced per user.
  globalTokenUsage: {
    kind: "token bucket",
    rate: 100_000,
    period: MINUTE,
    capacity: 100_000,
  },
  externalSearchPerUser: {
    kind: "token bucket",
    rate: 20,
    period: MINUTE,
    capacity: 20,
  },
  exaSearchPerUser: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 10,
  },
  jinaSearchPerUser: {
    kind: "token bucket",
    rate: 8,
    period: MINUTE,
    capacity: 8,
  },
  jinaReadPerUser: {
    kind: "token bucket",
    rate: 12,
    period: MINUTE,
    capacity: 12,
  },
  jinaRerankPerUser: {
    kind: "token bucket",
    rate: 12,
    period: MINUTE,
    capacity: 12,
  },
  crossrefLookupGlobal: {
    kind: "token bucket",
    rate: 30,
    period: MINUTE,
    capacity: 30,
  },
  arxivSearchGlobal: {
    kind: "fixed window",
    rate: 1,
    period: THREE_SECONDS,
    capacity: 1,
  },
  openAlexSearchGlobal: {
    kind: "token bucket",
    rate: 30,
    period: MINUTE,
    capacity: 30,
  },
  // Feed service-path buckets (cron, no authenticated user). Mirror the
  // openAlexSearchGlobal pattern: global throttles that protect the providers
  // without consuming per-user credits.
  exaSearchGlobal: {
    kind: "token bucket",
    rate: 6,
    period: MINUTE,
    capacity: 6,
  },
  googleFactCheckGlobal: {
    kind: "token bucket",
    rate: 30,
    period: MINUTE,
    capacity: 30,
  },
  gdeltGlobal: {
    kind: "token bucket",
    rate: 12,
    period: MINUTE,
    capacity: 12,
  },
  // Per-user gate on the "add a paper / URL to library" ingestion pipeline.
  paperIngestPerUser: {
    kind: "token bucket",
    rate: 12,
    period: MINUTE,
    capacity: 12,
  },
  // Per-user gate on downloading open-access PDFs (bandwidth/cost guard).
  paperPdfDownloadPerUser: {
    kind: "token bucket",
    rate: 12,
    period: MINUTE,
    capacity: 12,
  },
  // Politeness throttle for Unpaywall (100k/day shared) and Semantic Scholar.
  unpaywallGlobal: {
    kind: "token bucket",
    rate: 60,
    period: MINUTE,
    capacity: 60,
  },
  semanticScholarGlobal: {
    kind: "fixed window",
    rate: 1,
    period: ONE_SECOND,
    capacity: 1,
  },
  // Per-user gate on ephemeral sandbox compute runs (the verification engine).
  // Each run provisions a Daytona sandbox (per-second billing), so this caps
  // fan-out per user independently of the monthly credit quota.
  sandboxComputePerUser: {
    kind: "token bucket",
    rate: 5,
    period: MINUTE,
    capacity: 5,
  },
});
