import { RateLimiterRedis } from "rate-limiter-flexible";
import { getServiceRedis } from "../clients/redis";

/**
 * Registry rate-limit per-rule (Slice 6.2: dipindah dari `apps/api-v2/src/lib/rate-limits.ts`
 * ke service layer supaya dipanggil dari api-v2 (bun) DAN proses eve (node, via dist) —
 * mis. backstop `chat:send` di `onMessage`). Fixed-window: `points` permintaan per
 * `duration` detik, scoped per-user (key = `ownerUserId`).
 */
export type RateLimitRule =
  | "workspaces:create"
  | "artifacts:create"
  | "artifacts:upload"
  | "chat:send";

const RATE_LIMIT_RULES: Record<RateLimitRule, { points: number; duration: number }> = {
  "workspaces:create": { points: 3, duration: 3600 },
  "artifacts:create": { points: 20, duration: 60 },
  "artifacts:upload": { points: 5, duration: 60 },
  // Cooldown kirim chat Astra: 20 turn / menit per user (anti-spam + lindungi kuota +
  // beban model). `getSendStatus` membaca sisa non-consuming; `onMessage` meng-consume.
  "chat:send": { points: 20, duration: 60 },
};

/** Konfigurasi rule (points/duration) — dipakai `getSendStatus` untuk hitung cooldown. */
export function rateLimitConfig(rule: RateLimitRule): { points: number; duration: number } {
  return RATE_LIMIT_RULES[rule];
}

const limiters = new Map<RateLimitRule, RateLimiterRedis>();

/** Limiter lazy singleton per-rule di atas ioredis singleton (`getServiceRedis()`). */
export function getRateLimiter(rule: RateLimitRule): RateLimiterRedis {
  const existing = limiters.get(rule);
  if (existing) return existing;
  const cfg = RATE_LIMIT_RULES[rule];
  const limiter = new RateLimiterRedis({
    storeClient: getServiceRedis(),
    keyPrefix: `rl:${rule}`,
    points: cfg.points,
    duration: cfg.duration,
  });
  limiters.set(rule, limiter);
  return limiter;
}
