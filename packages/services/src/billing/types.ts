import type { BillingStatus, CreditFeature, PlanKey, PublicPlanKey } from "../plan";

/** Snapshot ringkas untuk gerbang entitlement (mirror + admin; TANPA network). */
export type EntitlementSnapshot = {
  planKey: PlanKey;
  status: BillingStatus;
  isAdmin: boolean;
  isUnlimitedCredits: boolean;
  currentPeriodEnd: number | null;
};

/** Return-union entitlement (port V1 `EntitlementResult`) — BUKAN throw untuk block. */
export type EntitlementResult =
  | {
      ok: true;
      planKey: PlanKey;
      periodKey: string;
      resetAt: number;
      creditsLimit: number;
      creditsUsed: number;
      creditsRemaining: number;
    }
  | {
      ok: false;
      reason: "quota_exceeded" | "subscription_required" | "billing_inactive";
      planKey: PlanKey;
      requiredPlan: PublicPlanKey;
      resetAt: number;
      creditsLimit: number;
      creditsUsed: number;
      creditsRemaining: number;
    };

/** Argumen consumeCredits (port V1 `consumeCreditsInternal` args). */
export type ConsumeCreditsArgs = {
  ownerUserId: string;
  ownerEmail?: string | null;
  feature: CreditFeature;
  provider: string;
  model?: string;
  threadId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  credits?: number;
  estimatedCostCents?: number;
  metadataJson?: string;
  requiredPlan?: PublicPlanKey;
  agentKind?: "lite" | "pro";
  /** A9: kunci idempotency per-model-call → re-run saat resume tak double-debit. */
  idempotencyKey?: string;
};
