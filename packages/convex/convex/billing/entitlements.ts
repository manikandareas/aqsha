import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import {
  billingStatusAllowsUsage,
  currentMonthPeriod,
  estimateCredits,
  estimateProviderCostCents,
  intervalForProductKey,
  isPlanAtLeast,
  normalizeBillingStatus,
  PLAN_CATALOG,
  planForProductKey,
  requiredPlanForFeature,
  type BillingStatus,
  type CreditFeature,
  type PlanKey,
  type PublicPlanKey,
} from "./catalog";
import { getAdminBillingOverride } from "./admin";
import { polar } from "./polar";

const featureValidator = v.union(
  v.literal("normal_chat"),
  v.literal("cited_answer"),
  v.literal("deep_research"),
  v.literal("external_search"),
);

const runIdValidator = v.id("agentRuns");

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

export async function getBillingSnapshot(
  ctx: QueryCtx | MutationCtx,
  ownerUserId: string,
): Promise<{
  planKey: PlanKey;
  status: BillingStatus;
  subscription: Awaited<ReturnType<typeof polar.getCurrentSubscription>> | null;
  productKey?: string;
  currentPeriodEnd: number | null;
  isAdmin: boolean;
  isUnlimitedCredits: boolean;
  billingPortalAvailable: boolean;
}> {
  const admin = await getAdminBillingOverride(ctx, ownerUserId);
  if (admin.isAdmin) {
    const subscription = await getPolarSubscriptionOrNull(ctx, ownerUserId);
    const mirrored = subscription ? null : await getLatestMirroredSubscription(ctx, ownerUserId);
    return {
      planKey: "admin",
      status: "admin",
      subscription,
      productKey: undefined,
      currentPeriodEnd: null,
      isAdmin: true,
      isUnlimitedCredits: true,
      billingPortalAvailable: Boolean(subscription || mirrored),
    };
  }

  const subscription = await getPolarSubscriptionOrNull(ctx, ownerUserId);
  if (!subscription) {
    const mirrored = await getLatestMirroredSubscription(ctx, ownerUserId);
    if (mirrored) {
      return {
        planKey: mirrored.planKey,
        status: normalizeBillingStatus(mirrored.status),
        subscription: null,
        productKey: mirrored.productKey,
        currentPeriodEnd: mirrored.currentPeriodEnd ?? null,
        isAdmin: false,
        isUnlimitedCredits: false,
        billingPortalAvailable: true,
      };
    }
  }
  const productKey =
    typeof subscription?.productKey === "string" ? subscription.productKey : undefined;
  const planKey = planForProductKey(productKey);
  const status = normalizeBillingStatus(subscription?.status);
  return {
    planKey,
    status,
    subscription,
    productKey,
    currentPeriodEnd: parseTime(subscription?.currentPeriodEnd),
    isAdmin: false,
    isUnlimitedCredits: false,
    billingPortalAvailable: Boolean(subscription),
  };
}

async function getPolarSubscriptionOrNull(ctx: QueryCtx | MutationCtx, ownerUserId: string) {
  try {
    return await polar.getCurrentSubscription(ctx, { userId: ownerUserId });
  } catch (error) {
    if (readableError(error).includes("Product not found")) {
      return null;
    }
    throw error;
  }
}

async function getLatestMirroredSubscription(ctx: QueryCtx | MutationCtx, ownerUserId: string) {
  const [subscription] = await ctx.db
    .query("billingSubscriptions")
    .withIndex("by_owner_updated", (q) => q.eq("ownerUserId", ownerUserId))
    .order("desc")
    .take(1);
  return subscription ?? null;
}

export async function requireEntitlement(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    feature: CreditFeature;
    credits: number;
    requiredPlan?: PublicPlanKey;
  },
): Promise<EntitlementResult> {
  const requiredPlan = args.requiredPlan ?? requiredPlanForFeature(args.feature);
  const snapshot = await getBillingSnapshot(ctx, args.ownerUserId);
  const usageAllowed = billingStatusAllowsUsage({
    planKey: snapshot.planKey,
    status: snapshot.status,
    currentPeriodEnd: snapshot.currentPeriodEnd,
  });
  const period = await ensureCreditPeriod(ctx, {
    ownerUserId: args.ownerUserId,
    planKey: snapshot.planKey,
    status: snapshot.status,
  });
  const remaining = Math.max(0, period.creditsLimit - period.creditsUsed);

  if (snapshot.isAdmin) {
    return {
      ok: true,
      planKey: snapshot.planKey,
      periodKey: period.periodKey,
      resetAt: period.resetAt,
      creditsLimit: period.creditsLimit,
      creditsUsed: period.creditsUsed,
      creditsRemaining: remaining,
    };
  }

  if (!isPlanAtLeast(snapshot.planKey, requiredPlan)) {
    return entitlementFailure("subscription_required", snapshot.planKey, requiredPlan, period);
  }
  if (!usageAllowed) {
    return entitlementFailure("billing_inactive", snapshot.planKey, requiredPlan, period);
  }
  if (remaining < args.credits) {
    return entitlementFailure("quota_exceeded", snapshot.planKey, requiredPlan, period);
  }

  return {
    ok: true,
    planKey: snapshot.planKey,
    periodKey: period.periodKey,
    resetAt: period.resetAt,
    creditsLimit: period.creditsLimit,
    creditsUsed: period.creditsUsed,
    creditsRemaining: remaining,
  };
}

export async function consumeCredits(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    feature: CreditFeature;
    credits: number;
    provider: string;
    model?: string;
    threadId?: string;
    runId?: Id<"agentRuns">;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostCents?: number;
    metadataJson?: string;
    requiredPlan?: PublicPlanKey;
  },
): Promise<EntitlementResult> {
  const entitlement = await requireEntitlement(ctx, args);
  if (!entitlement.ok) {
    return entitlement;
  }

  const now = Date.now();
  const period = await ensureCreditPeriod(ctx, {
    ownerUserId: args.ownerUserId,
    planKey: entitlement.planKey,
    status: "active",
  });
  const estimatedCostCents =
    args.estimatedCostCents ??
    estimateProviderCostCents({
      provider: args.provider,
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      feature: args.feature,
    });

  await ctx.db.patch("billingCreditPeriods", period._id, {
    creditsUsed: period.creditsUsed + args.credits,
    estimatedCostCents: period.estimatedCostCents + estimatedCostCents,
    updatedAt: now,
  });
  await ctx.db.insert("providerUsageLedger", {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    runId: args.runId,
    feature: args.feature,
    provider: args.provider,
    model: args.model,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    totalTokens: args.totalTokens,
    credits: args.credits,
    estimatedCostCents,
    metadataJson: args.metadataJson,
    createdAt: now,
  });

  return {
    ...entitlement,
    creditsUsed: period.creditsUsed + args.credits,
    creditsRemaining: Math.max(
      0,
      period.creditsLimit - period.creditsUsed - args.credits,
    ),
  };
}

export async function recordProviderUsage(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    feature: CreditFeature;
    credits: number;
    provider: string;
    model?: string;
    threadId?: string;
    runId?: Id<"agentRuns">;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostCents?: number;
    metadataJson?: string;
  },
) {
  const snapshot = await getBillingSnapshot(ctx, args.ownerUserId);
  const period = await ensureCreditPeriod(ctx, {
    ownerUserId: args.ownerUserId,
    planKey: snapshot.planKey,
    status: snapshot.status,
  });
  const now = Date.now();
  const estimatedCostCents =
    args.estimatedCostCents ??
    estimateProviderCostCents({
      provider: args.provider,
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      feature: args.feature,
    });

  await ctx.db.patch("billingCreditPeriods", period._id, {
    creditsUsed: period.creditsUsed + args.credits,
    estimatedCostCents: period.estimatedCostCents + estimatedCostCents,
    updatedAt: now,
  });
  await ctx.db.insert("providerUsageLedger", {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    runId: args.runId,
    feature: args.feature,
    provider: args.provider,
    model: args.model,
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    totalTokens: args.totalTokens,
    credits: args.credits,
    estimatedCostCents,
    metadataJson: args.metadataJson,
    createdAt: now,
  });
}

export const consumeCreditsInternal = internalMutation({
  args: {
    ownerUserId: v.string(),
    feature: featureValidator,
    provider: v.string(),
    model: v.optional(v.string()),
    threadId: v.optional(v.string()),
    runId: v.optional(runIdValidator),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    credits: v.optional(v.number()),
    estimatedCostCents: v.optional(v.number()),
    metadataJson: v.optional(v.string()),
    requiredPlan: v.optional(v.union(v.literal("free"), v.literal("starter"), v.literal("plus"))),
  },
  handler: async (ctx, args): Promise<EntitlementResult> => {
    return await consumeCredits(ctx, {
      ...args,
      credits:
        args.credits ??
        estimateCredits({
          feature: args.feature,
          provider: args.provider,
          inputTokens: args.inputTokens,
          outputTokens: args.outputTokens,
          totalTokens: args.totalTokens,
        }),
    });
  },
});

export const syncSubscriptionFromPolar = internalMutation({
  args: {
    eventKey: v.string(),
    eventType: v.string(),
    ownerUserId: v.string(),
    polarSubscriptionId: v.string(),
    polarProductId: v.string(),
    productKey: v.optional(v.string()),
    status: v.string(),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    canceledAt: v.optional(v.number()),
    rawJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingEvent = await ctx.db
      .query("billingEvents")
      .withIndex("by_event_key", (q) => q.eq("eventKey", args.eventKey))
      .unique();
    if (existingEvent) {
      return { ok: true, deduped: true };
    }

    const productKey = args.productKey;
    const planKey = planForProductKey(productKey);
    if (planKey === "free" || planKey === "admin") {
      throw new ConvexError("Unknown Polar product for subscription");
    }
    const billingInterval = intervalForProductKey(productKey) ?? "month";
    const now = Date.now();
    const existing = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_subscription", (q) =>
        q.eq("polarSubscriptionId", args.polarSubscriptionId),
      )
      .unique();
    const row = {
      ownerUserId: args.ownerUserId,
      polarSubscriptionId: args.polarSubscriptionId,
      polarProductId: args.polarProductId,
      productKey,
      planKey,
      billingInterval,
      status: args.status,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      canceledAt: args.canceledAt,
      rawJson: args.rawJson,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch("billingSubscriptions", existing._id, row);
    } else {
      await ctx.db.insert("billingSubscriptions", {
        ...row,
        createdAt: now,
      });
    }
    await ctx.db.insert("billingEvents", {
      eventKey: args.eventKey,
      eventType: args.eventType,
      processedAt: now,
    });
    return { ok: true, deduped: false };
  },
});

export async function ensureCreditPeriod(
  ctx: QueryCtx | MutationCtx,
  args: {
    ownerUserId: string;
    planKey: PlanKey;
    status: string;
  },
) {
  const month = currentMonthPeriod();
  const plan = PLAN_CATALOG[args.planKey];
  const existing = await ctx.db
    .query("billingCreditPeriods")
    .withIndex("by_owner_period", (q) =>
      q.eq("ownerUserId", args.ownerUserId).eq("periodKey", month.key),
    )
    .unique();

  if (existing) {
    if (
      isMutationCtx(ctx) &&
      (existing.planKey !== args.planKey ||
        existing.creditsLimit !== plan.monthlyCredits ||
        existing.spendCeilingCents !== plan.providerSpendCeilingCents ||
        existing.status !== args.status)
    ) {
      await ctx.db.patch("billingCreditPeriods", existing._id, {
        planKey: args.planKey,
        status: args.status,
        creditsLimit: plan.monthlyCredits,
        spendCeilingCents: plan.providerSpendCeilingCents,
        updatedAt: Date.now(),
      });
      return {
        ...existing,
        planKey: args.planKey,
        status: args.status,
        creditsLimit: plan.monthlyCredits,
        spendCeilingCents: plan.providerSpendCeilingCents,
      };
    }
    return existing;
  }

  if (!isMutationCtx(ctx)) {
    return {
      _id: "" as Id<"billingCreditPeriods">,
      _creationTime: Date.now(),
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
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } satisfies Doc<"billingCreditPeriods">;
  }

  const now = Date.now();
  const id = await ctx.db.insert("billingCreditPeriods", {
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
  const created = await ctx.db.get("billingCreditPeriods", id);
  if (!created) {
    throw new ConvexError("Unable to create billing period");
  }
  return created;
}

function entitlementFailure(
  reason: "quota_exceeded" | "subscription_required" | "billing_inactive",
  planKey: PlanKey,
  requiredPlan: PublicPlanKey,
  period: Doc<"billingCreditPeriods">,
): EntitlementResult {
  return {
    ok: false,
    reason,
    planKey,
    requiredPlan,
    resetAt: period.resetAt,
    creditsLimit: period.creditsLimit,
    creditsUsed: period.creditsUsed,
    creditsRemaining: Math.max(0, period.creditsLimit - period.creditsUsed),
  };
}

function parseTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isMutationCtx(ctx: QueryCtx | MutationCtx): ctx is MutationCtx {
  return "scheduler" in ctx;
}
