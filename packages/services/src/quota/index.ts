// Quota subpath (`@aqsha/services/quota`) — rate-limit registry + send-gate. Bundle-safe
// (rate-limiter-flexible + ioredis = npm terkompilasi) → dipakai api DAN agent
// (runtime Mastra, via dist). Granular agar konsumen dist tak menarik barrel penuh.
export {
  getRateLimiter,
  type RateLimitRule,
  rateLimitConfig,
} from "./rate-limits";
export {
  type SendBlockReason,
  type SendCheckResult,
  type SendFeature,
  SendQuotaService,
  type SendStatus,
} from "./send-quota.service";
