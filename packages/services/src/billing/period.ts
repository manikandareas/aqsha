import { type BillingCreditPeriod, BillingRepo, type DbOrTx, type Tx } from "@aqsha/db";
import {
  type BillingStatus,
  billingStatusAllowsUsage,
  type CreditFeature,
  currentMonthPeriod,
  isPlanAtLeast,
  PLAN_CATALOG,
  type PlanKey,
  type PublicPlanKey,
  requiredPlanForFeature,
} from "../plan";
import type { EntitlementResult } from "./types";

/** UTC calendar day ("YYYY-MM-DD") untuk epoch-ms (port V1 `utcDateString`). */
export function utcDateString(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function syncedPatch(planKey: PlanKey, status: string) {
  const plan = PLAN_CATALOG[planKey];
  return {
    planKey,
    status,
    creditsLimit: plan.monthlyCredits,
    spendCeilingCents: plan.providerSpendCeilingCents,
  };
}

function needsResync(period: BillingCreditPeriod, planKey: PlanKey, status: string): boolean {
  const plan = PLAN_CATALOG[planKey];
  return (
    period.planKey !== planKey ||
    period.status !== status ||
    period.creditsLimit !== plan.monthlyCredits ||
    period.spendCeilingCents !== plan.providerSpendCeilingCents
  );
}

/**
 * Pastikan baris credit period bulan ini ada + ter-sync limit plan (read path —
 * getCurrentPeriod/getBillingSnapshot). Insert race-safe (on conflict do nothing)
 * lalu re-read. Port V1 `ensureCreditPeriod` (versi non-locked).
 */
export async function ensureCreditPeriod(
  db: DbOrTx,
  args: { ownerUserId: string; planKey: PlanKey; status: string },
): Promise<BillingCreditPeriod> {
  const month = currentMonthPeriod();
  const plan = PLAN_CATALOG[args.planKey];
  const now = Date.now();

  const existing = await BillingRepo.findPeriod(db, args.ownerUserId, month.key);
  if (existing) {
    if (needsResync(existing, args.planKey, args.status)) {
      await BillingRepo.updatePeriod(db, existing.id, { ...syncedPatch(args.planKey, args.status), updatedAt: now });
      return { ...existing, ...syncedPatch(args.planKey, args.status), updatedAt: now };
    }
    return existing;
  }

  await BillingRepo.insertPeriodIfAbsent(db, {
    id: crypto.randomUUID(),
    ownerUserId: args.ownerUserId,
    periodKey: month.key,
    planKey: args.planKey,
    status: args.status,
    creditsLimit: plan.monthlyCredits,
    creditsUsed: 0,
    estimatedCostCents: 0,
    spendCeilingCents: plan.providerSpendCeilingCents,
    startedAt: month.startAt,
    resetAt: month.resetAt,
    createdAt: now,
    updatedAt: now,
  });
  const created = await BillingRepo.findPeriod(db, args.ownerUserId, month.key);
  if (!created) {
    throw new Error("billing_period_create_failed");
  }
  return created;
}

/**
 * Versi LOCKED (FOR UPDATE) untuk transaksi consumeCredits: insert-if-absent →
 * lock → re-sync limit pada baris terkunci. Increment selanjutnya (debit) atomik.
 */
export async function ensureAndLockPeriod(
  tx: Tx,
  args: { ownerUserId: string; planKey: PlanKey; status: string },
): Promise<BillingCreditPeriod> {
  const month = currentMonthPeriod();
  const plan = PLAN_CATALOG[args.planKey];
  const now = Date.now();

  await BillingRepo.insertPeriodIfAbsent(tx, {
    id: crypto.randomUUID(),
    ownerUserId: args.ownerUserId,
    periodKey: month.key,
    planKey: args.planKey,
    status: args.status,
    creditsLimit: plan.monthlyCredits,
    creditsUsed: 0,
    estimatedCostCents: 0,
    spendCeilingCents: plan.providerSpendCeilingCents,
    startedAt: month.startAt,
    resetAt: month.resetAt,
    createdAt: now,
    updatedAt: now,
  });

  let period = await BillingRepo.lockPeriod(tx, args.ownerUserId, month.key);
  if (!period) throw new Error("billing_period_lock_failed");

  if (needsResync(period, args.planKey, args.status)) {
    await BillingRepo.updatePeriod(tx, period.id, { ...syncedPatch(args.planKey, args.status), updatedAt: now });
    period = { ...period, ...syncedPatch(args.planKey, args.status), updatedAt: now };
  }
  return period;
}

/**
 * Gerbang entitlement PURE (port V1 `requireEntitlement` ordering) — testable
 * tanpa db. `deepLimitReached` di-precompute caller (butuh count query).
 */
export function evaluateGate(args: {
  isAdmin: boolean;
  planKey: PlanKey;
  status: BillingStatus;
  currentPeriodEnd: number | null;
  feature: CreditFeature;
  credits: number;
  requiredPlan?: PublicPlanKey;
  period: Pick<BillingCreditPeriod, "periodKey" | "resetAt" | "creditsLimit" | "creditsUsed">;
  deepLimitReached: boolean;
  now?: number;
}): EntitlementResult {
  const requiredPlan = args.requiredPlan ?? requiredPlanForFeature(args.feature);
  const { period } = args;
  const remaining = Math.max(0, period.creditsLimit - period.creditsUsed);
  const okBase = {
    planKey: args.planKey,
    periodKey: period.periodKey,
    resetAt: period.resetAt,
    creditsLimit: period.creditsLimit,
    creditsUsed: period.creditsUsed,
    creditsRemaining: remaining,
  };

  if (args.isAdmin) return { ok: true, ...okBase };

  const fail = (reason: "quota_exceeded" | "subscription_required" | "billing_inactive"): EntitlementResult => ({
    ok: false,
    reason,
    planKey: args.planKey,
    requiredPlan,
    resetAt: period.resetAt,
    creditsLimit: period.creditsLimit,
    creditsUsed: period.creditsUsed,
    creditsRemaining: remaining,
  });

  if (!isPlanAtLeast(args.planKey, requiredPlan)) return fail("subscription_required");
  if (!billingStatusAllowsUsage({ planKey: args.planKey, status: args.status, currentPeriodEnd: args.currentPeriodEnd, now: args.now })) {
    return fail("billing_inactive");
  }
  if (args.feature === "deep_research" && args.deepLimitReached) return fail("quota_exceeded");
  if (remaining < args.credits) return fail("quota_exceeded");

  return { ok: true, ...okBase };
}
