import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

const FIVE_SECONDS = 5_000;

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
});
