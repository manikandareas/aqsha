import { RateLimiterRedis } from "rate-limiter-flexible";
import { getServiceRedis } from "../clients/redis";

/**
 * Registry rate-limit per-rule — hidup di service layer supaya dipanggil dari api DAN
 * agent (runtime Mastra, via dist) — mis. backstop `chat:send` di processor billing.
 * Fixed-window: `points` permintaan per `duration` detik, scoped per-user
 * (key = `ownerUserId`).
 */
export type RateLimitRule =
  | "workspaces:create"
  | "artifacts:create"
  | "artifacts:upload"
  | "chat:send"
  | "account:delete"
  | "security:sessions-revoke"
  | "explore:search"
  | "citations:create"
  | "citations:import";

const RATE_LIMIT_RULES: Record<RateLimitRule, { points: number; duration: number }> = {
  "workspaces:create": { points: 3, duration: 3600 },
  "artifacts:create": { points: 20, duration: 60 },
  "artifacts:upload": { points: 5, duration: 60 },
  // Cooldown kirim chat Astra: 20 turn / menit per user (anti-spam + lindungi kuota +
  // beban model). `getSendStatus` membaca sisa non-consuming; `onMessage` meng-consume.
  "chat:send": { points: 20, duration: 60 },
  // Hapus akun destruktif & irreversible — 5/jam cukup (guard anti-misfire, bukan throughput).
  "account:delete": { points: 5, duration: 3600 },
  // Keluarkan perangkat — 10/menit cukup (klik tombol manual, bukan throughput).
  "security:sessions-revoke": { points: 10, duration: 60 },
  // Live search Explore (gratis, tembak OpenAlex/arXiv/Crossref) — 30/menit/user cukup
  // longgar (hasil di-cache Redis) tapi membatasi abuse call eksternal yang tak berbayar.
  "explore:search": { points: 30, duration: 60 },
  // Create referensi manual/DOI — klik user, bukan throughput; DOI memukul resolver eksternal.
  "citations:create": { points: 20, duration: 60 },
  // Import/commit batch .bib/.ris — parse server-side hingga 5.000 record per batch.
  "citations:import": { points: 5, duration: 60 },
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
