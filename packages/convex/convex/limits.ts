import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

const FIVE_SECONDS = 5_000;
const THREE_SECONDS = 3_000;

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
});
