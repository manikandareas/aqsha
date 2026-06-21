import type { Db, DbOrTx } from "@aqsha/db";
import type { RateLimiterRes } from "rate-limiter-flexible";
import { BillingService } from "../billing.service";
import type { PublicPlanKey } from "../plan";
import { getRateLimiter, rateLimitConfig } from "./rate-limits";

/** Alasan blok kirim — superset return-union billing (`EntitlementResult`) + cooldown rate-limit. */
export type SendBlockReason =
  | "cooldown"
  | "quota_exceeded"
  | "subscription_required"
  | "billing_inactive";

/** Hasil backstop `check` (onMessage). Blok = drop turn (return null di channel). */
export type SendCheckResult =
  | { ok: true }
  | { ok: false; reason: SendBlockReason; retryAt: number };

/** Bentuk untuk UI composer (`GET /threads/send-status`) — non-consuming preview. */
export type SendStatus = {
  canSend: boolean;
  reason?: SendBlockReason;
  /** Epoch-ms saat kirim diizinkan lagi (akhir cooldown / reset period bila kuota habis). */
  retryAt?: number;
  creditsRemaining: number;
  creditsLimit: number;
  /** Plan minimal yang dibutuhkan bila `reason==='subscription_required'`. */
  requiredPlan?: PublicPlanKey;
};

const RULE = "chat:send" as const;

/**
 * Gerbang kirim chat Astra (Slice 6.2). Dua entry:
 * - `check` (consuming) — backstop OTORITATIF di `onMessage` proses eve. Cek entitlement
 *   non-consuming DULU (biar blok billing tak membakar jatah cooldown), lalu consume satu
 *   poin `chat:send`. Blok → return-union (channel `return null` = drop turn).
 * - `getSendStatus` (non-consuming) — preview UX-ramah untuk composer. Tak mengubah state.
 *
 * Fail-OPEN saat Redis error (sama semantik macro api-v2): hiccup infra tak boleh memblok
 * user; `rate-limiter-flexible` reject `Error` untuk store-error vs `RateLimiterRes` untuk limit.
 */
export const SendQuotaService = {
  async check(
    db: Db,
    args: { ownerUserId: string; ownerEmail?: string | null },
  ): Promise<SendCheckResult> {
    // 1) Entitlement (non-consuming). `normal_chat` floor 1 kredit (Lite, D-B).
    const ent = await BillingService.requireEntitlement(db, {
      ownerUserId: args.ownerUserId,
      ownerEmail: args.ownerEmail,
      feature: "normal_chat",
      credits: 1,
    });
    if (!ent.ok) {
      return { ok: false, reason: ent.reason, retryAt: ent.resetAt };
    }

    // 2) Cooldown rate-limit (consuming). Store-error → fail-open (izinkan).
    try {
      await getRateLimiter(RULE).consume(args.ownerUserId);
    } catch (rejected) {
      if (rejected instanceof Error) {
        console.error("[send-quota] chat:send store error (fail-open)", rejected);
        return { ok: true };
      }
      const res = rejected as RateLimiterRes;
      return { ok: false, reason: "cooldown", retryAt: Date.now() + (res.msBeforeNext ?? 1000) };
    }

    return { ok: true };
  },

  async getSendStatus(
    db: DbOrTx,
    args: { ownerUserId: string; ownerEmail?: string | null },
  ): Promise<SendStatus> {
    const ent = await BillingService.requireEntitlement(db, {
      ownerUserId: args.ownerUserId,
      ownerEmail: args.ownerEmail,
      feature: "normal_chat",
      credits: 1,
    });

    // Cooldown preview — `.get()` non-consuming (null = belum ada record = penuh).
    let cooldownUntil: number | null = null;
    try {
      const res = await getRateLimiter(RULE).get(args.ownerUserId);
      if (res && res.remainingPoints <= 0) {
        cooldownUntil = Date.now() + (res.msBeforeNext ?? 0);
      }
    } catch (err) {
      // Fail-open: anggap tak ada cooldown bila store error.
      console.error("[send-quota] chat:send get error (fail-open)", err);
    }

    if (!ent.ok) {
      return {
        canSend: false,
        reason: ent.reason,
        retryAt: ent.resetAt,
        creditsRemaining: ent.creditsRemaining,
        creditsLimit: ent.creditsLimit,
        requiredPlan: ent.requiredPlan,
      };
    }
    if (cooldownUntil !== null) {
      return {
        canSend: false,
        reason: "cooldown",
        retryAt: cooldownUntil,
        creditsRemaining: ent.creditsRemaining,
        creditsLimit: ent.creditsLimit,
      };
    }
    return {
      canSend: true,
      creditsRemaining: ent.creditsRemaining,
      creditsLimit: ent.creditsLimit,
    };
  },
};
