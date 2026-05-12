import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { PLAN_CATALOG } from "./catalog";
import { ensureCreditPeriod, getBillingSnapshot } from "./entitlements";

export const get = query({
  args: {},
  returns: v.object({
    planKey: v.union(v.literal("free"), v.literal("starter"), v.literal("plus")),
    planLabel: v.string(),
    status: v.string(),
    productKey: v.union(v.string(), v.null()),
    currentPeriodEnd: v.union(v.number(), v.null()),
    creditsLimit: v.number(),
    creditsUsed: v.number(),
    creditsRemaining: v.number(),
    resetAt: v.number(),
    providerSpendCeilingCents: v.number(),
    estimatedCostCents: v.number(),
  }),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const snapshot = await getBillingSnapshot(ctx, user._id);
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
      currentPeriodEnd: snapshot.currentPeriodEnd,
      creditsLimit: period.creditsLimit,
      creditsUsed: period.creditsUsed,
      creditsRemaining: Math.max(0, period.creditsLimit - period.creditsUsed),
      resetAt: period.resetAt,
      providerSpendCeilingCents: period.spendCeilingCents,
      estimatedCostCents: period.estimatedCostCents,
    };
  },
});
