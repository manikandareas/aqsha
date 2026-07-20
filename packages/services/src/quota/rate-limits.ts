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
  | "citations:import"
  | "integrations:connect"
  | "integrations:sync"
  | "waitlist:submit-ip"
  | "waitlist:submit-email"
  | "waitlist:verify-ip"
  | "latex:compile"
  | "typst:compile";

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
  // Mulai OAuth connect provider — klik user, bukan throughput.
  "integrations:connect": { points: 10, duration: 60 },
  // Preview/commit/refresh sync provider — tembak API eksternal (Mendeley/Zotero).
  "integrations:sync": { points: 10, duration: 60 },
  // Waitlist publik (tanpa auth) — key = IP atau email ternormalisasi, bukan ownerUserId.
  "waitlist:submit-ip": { points: 5, duration: 600 },
  "waitlist:submit-email": { points: 3, duration: 3600 },
  "waitlist:verify-ip": { points: 10, duration: 600 },
  // Compile LaTeX sinkron memakan CPU detik-an per panggilan; 10/menit/user cukup untuk
  // loop edit manusia + agen, sekaligus mencegah antrean compile menumpuk.
  "latex:compile": { points: 10, duration: 60 },
  // Compile/ekspor Typst server-side (dry-run proposal + ekspor PDF/DOCX) — bucket bersama
  // agen+user; 10/menit cukup untuk loop edit sekaligus mencegah antrean compile menumpuk.
  "typst:compile": { points: 10, duration: 60 },
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
