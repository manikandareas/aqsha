import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { ensureCreditPeriod, getBillingSnapshot } from "./entitlements";

export const getCurrentPeriod = query({
  args: {},
  returns: v.object({
    periodKey: v.string(),
    planKey: v.union(v.literal("free"), v.literal("starter"), v.literal("plus")),
    creditsLimit: v.number(),
    creditsUsed: v.number(),
    creditsRemaining: v.number(),
    estimatedCostCents: v.number(),
    spendCeilingCents: v.number(),
    resetAt: v.number(),
  }),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const snapshot = await getBillingSnapshot(ctx, user._id);
    const period = await ensureCreditPeriod(ctx, {
      ownerUserId: user._id,
      planKey: snapshot.planKey,
      status: snapshot.status,
    });
    return {
      periodKey: period.periodKey,
      planKey: period.planKey,
      creditsLimit: period.creditsLimit,
      creditsUsed: period.creditsUsed,
      creditsRemaining: Math.max(0, period.creditsLimit - period.creditsUsed),
      estimatedCostCents: period.estimatedCostCents,
      spendCeilingCents: period.spendCeilingCents,
      resetAt: period.resetAt,
    };
  },
});
