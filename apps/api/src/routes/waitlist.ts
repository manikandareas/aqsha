import {
  normalizeWaitlistJoinInput,
  sendWaitlistVerificationEmail,
  WaitlistService,
} from "@aqsha/services";
import { getRateLimiter, type RateLimitRule } from "@aqsha/services/quota";
import { Elysia, status, t } from "elysia";
import { getDb } from "../clients/db";
import { logger } from "../lib/log";

type PublicLimitResult = { ok: true } | { ok: false; retryAt: number };

/**
 * Consume limiter publik (IP/email). Redis store error → fail-open (sama seperti
 * `rateLimitMacro` auth), supaya hiccup infra tak memblok waitlist.
 */
async function consumePublicLimit(rule: RateLimitRule, key: string): Promise<PublicLimitResult> {
  try {
    await getRateLimiter(rule).consume(key);
    return { ok: true };
  } catch (rejected) {
    if (rejected instanceof Error) {
      logger.warn({ rule, err: rejected }, "waitlist_rate_limit_store_error_fail_open");
      return { ok: true };
    }
    const msBeforeNext = (rejected as { msBeforeNext?: number }).msBeforeNext ?? 1000;
    return { ok: false, retryAt: Date.now() + msBeforeNext };
  }
}

/** IP dari edge (`cf-connecting-ip`) → `x-forwarded-for` pertama → `unknown`. Tidak di-persist. */
function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

function rateLimited(retryAt: number) {
  return status(429, {
    message: "Terlalu banyak permintaan. Coba lagi nanti.",
    code: "rate_limited",
    severity: "info" as const,
    retryAt,
  });
}

/**
 * Waitlist publik (tanpa Clerk):
 * - POST /waitlist — submit email (+ company opsional) + honeypot `website`
 * - POST /waitlist/verify — konfirmasi token
 *
 * Response sukses selalu `{ ok: true }` (tanpa membedakan already-confirmed).
 */
export const waitlist = new Elysia({ prefix: "/waitlist" })
  .post(
    "/",
    async ({ body, request }) => {
      // Honeypot: bot yang isi field tersembunyi dapat respons sukses palsu.
      if (body.website && body.website.trim().length > 0) {
        return { ok: true as const };
      }

      const ip = clientIp(request);
      const ipLimit = await consumePublicLimit("waitlist:submit-ip", ip);
      if (!ipLimit.ok) return rateLimited(ipLimit.retryAt);

      // Validasi/normalize sebelum DB supaya invalid email → 400 tanpa butuh Postgres.
      const normalized = normalizeWaitlistJoinInput({
        email: body.email,
        companyOrUniversity: body.companyOrUniversity,
      });
      const emailLimit = await consumePublicLimit("waitlist:submit-email", normalized.email);
      if (!emailLimit.ok) return rateLimited(emailLimit.retryAt);

      const { db } = getDb();
      await WaitlistService.join(
        db,
        {
          email: normalized.email,
          companyOrUniversity: normalized.companyOrUniversity,
        },
        {
          siteUrl: process.env.PUBLIC_SITE_URL ?? "http://localhost:4321",
          sendEmail: sendWaitlistVerificationEmail,
        },
      );
      // Jangan expose action service (already_confirmed vs verification_sent).
      return { ok: true as const };
    },
    {
      body: t.Object({
        email: t.String(),
        companyOrUniversity: t.Optional(t.String()),
        website: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/verify",
    async ({ body, request }) => {
      const ip = clientIp(request);
      const ipLimit = await consumePublicLimit("waitlist:verify-ip", ip);
      if (!ipLimit.ok) return rateLimited(ipLimit.retryAt);

      const { db } = getDb();
      await WaitlistService.verify(db, body.token);
      return { ok: true as const };
    },
    {
      body: t.Object({
        token: t.String(),
      }),
    },
  );
