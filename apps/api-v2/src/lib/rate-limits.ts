import { RateLimiterRedis } from "rate-limiter-flexible";
import { getRedis } from "../clients/redis";

/**
 * Registry rate-limit per-rule (port `limits.ts` V1). Fixed-window: `points`
 * permintaan per `duration` detik, scoped per-user (key = `ownerUserId`).
 * Tambah rule baru di sini (mis. `artifacts:create`/`send`) lalu pakai macro
 * `rateLimit("<rule>")` di route.
 */
export type RateLimitRule = "workspaces:create" | "artifacts:create" | "artifacts:upload";

const RATE_LIMIT_RULES: Record<RateLimitRule, { points: number; duration: number }> = {
  "workspaces:create": { points: 3, duration: 3600 },
  "artifacts:create": { points: 20, duration: 60 },
  "artifacts:upload": { points: 5, duration: 60 },
};

const limiters = new Map<RateLimitRule, RateLimiterRedis>();

/** Limiter lazy singleton per-rule di atas ioredis singleton (`getRedis()`). */
export function getRateLimiter(rule: RateLimitRule): RateLimiterRedis {
  const existing = limiters.get(rule);
  if (existing) return existing;
  const cfg = RATE_LIMIT_RULES[rule];
  const limiter = new RateLimiterRedis({
    storeClient: getRedis(),
    keyPrefix: `rl:${rule}`,
    points: cfg.points,
    duration: cfg.duration,
  });
  limiters.set(rule, limiter);
  return limiter;
}
