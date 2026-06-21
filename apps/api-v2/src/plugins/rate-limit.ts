import { getRateLimiter, type RateLimitRule } from "@aqsha/services/quota";
import { Elysia } from "elysia";

/**
 * Macro rate-limit Redis reusable. Route opt-in via `{ auth: true, rateLimit: "<rule>" }`
 * — `authMacro.resolve` jalan lebih dulu (fase resolve sebelum beforeHandle), jadi
 * `ownerUserId` sudah ter-resolve sebagai key.
 *
 * - Lewat limit → `429 { message, code:"rate_limited", severity:"info", retryAt }`
 *   (`retryAt = now + msBeforeNext`); errorPlugin tidak terlibat (return body langsung).
 * - Redis/store error → **fail-OPEN** (log, lanjutkan) supaya hiccup infra tak
 *   memblokir user. `rate-limiter-flexible` me-reject dengan `Error` untuk store
 *   error vs `RateLimiterRes` untuk limit — itu pembedanya.
 */
export const rateLimitMacro = new Elysia({ name: "rateLimitMacro" }).macro({
  rateLimit(rule: RateLimitRule) {
    return {
      async beforeHandle({
        ownerUserId,
        set,
      }: {
        ownerUserId?: string | null;
        set: { status?: number | string };
      }) {
        if (!ownerUserId) return;
        try {
          await getRateLimiter(rule).consume(ownerUserId);
        } catch (rejected) {
          if (rejected instanceof Error) {
            console.error(`[api-v2] rate-limit ${rule} store error (fail-open)`, rejected);
            return;
          }
          const msBeforeNext = (rejected as { msBeforeNext?: number }).msBeforeNext ?? 1000;
          set.status = 429;
          return {
            message: "Terlalu banyak permintaan. Coba lagi nanti.",
            code: "rate_limited",
            severity: "info" as const,
            retryAt: Date.now() + msBeforeNext,
          };
        }
      },
    };
  },
});
