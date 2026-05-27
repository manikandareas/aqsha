import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { intervalForProductKey, PLAN_CATALOG } from "./catalog";
import { ensureCreditPeriod, getBillingSnapshot } from "./entitlements";

export const get = query({
  args: {},
  returns: v.object({
    planKey: v.union(
      v.literal("free"),
      v.literal("starter"),
      v.literal("plus"),
      v.literal("admin"),
    ),
    planLabel: v.string(),
    status: v.string(),
    productKey: v.union(v.string(), v.null()),
    billingInterval: v.union(v.literal("month"), v.literal("year"), v.null()),
    currentPeriodEnd: v.union(v.number(), v.null()),
    cancelAtPeriodEnd: v.boolean(),
    isAdmin: v.boolean(),
    isUnlimitedCredits: v.boolean(),
    billingPortalAvailable: v.boolean(),
    creditsLimit: v.number(),
    creditsUsed: v.number(),
    creditsRemaining: v.number(),
    resetAt: v.number(),
    providerSpendCeilingCents: v.number(),
    estimatedCostCents: v.number(),
  }),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const snapshot = await getBillingSnapshot(ctx, user._id, user.email);
    const period = await ensureCreditPeriod(ctx, {
      ownerUserId: user._id,
      planKey: snapshot.planKey,
      status: snapshot.status,
    });
    const plan = PLAN_CATALOG[snapshot.planKey];
    return {
      planKey: snapshot.planKey,
      planLabel: plan.label,
      status: snapshot.status,
      productKey: snapshot.productKey ?? null,
      billingInterval: intervalForProductKey(snapshot.productKey),
      currentPeriodEnd: snapshot.currentPeriodEnd,
      cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      isAdmin: snapshot.isAdmin,
      isUnlimitedCredits: snapshot.isUnlimitedCredits,
      billingPortalAvailable: snapshot.billingPortalAvailable,
      creditsLimit: period.creditsLimit,
      creditsUsed: period.creditsUsed,
      creditsRemaining: Math.max(0, period.creditsLimit - period.creditsUsed),
      resetAt: period.resetAt,
      providerSpendCeilingCents: period.spendCeilingCents,
      estimatedCostCents: period.estimatedCostCents,
    };
  },
});
