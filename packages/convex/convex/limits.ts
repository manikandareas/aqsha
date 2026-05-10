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
  tokenUsagePerUser: {
    kind: "token bucket",
    rate: 2_000,
    period: MINUTE,
    capacity: 10_000,
  },
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
});
