import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { ensureCreditPeriod, getBillingSnapshot } from "./entitlements";

const featureCountValidator = v.object({
  normal_chat: v.number(),
  cited_answer: v.number(),
  deep_research: v.number(),
  external_search: v.number(),
});

const emptyFeatureCounts = () => ({
  normal_chat: 0,
  cited_answer: 0,
  deep_research: 0,
  external_search: 0,
});

export const getCurrentPeriod = query({
  args: {},
  returns: v.object({
    periodKey: v.string(),
    planKey: v.union(
      v.literal("free"),
      v.literal("starter"),
      v.literal("plus"),
      v.literal("admin"),
    ),
    isAdmin: v.boolean(),
    isUnlimitedCredits: v.boolean(),
    creditsLimit: v.number(),
    creditsUsed: v.number(),
    creditsRemaining: v.number(),
    estimatedCostCents: v.number(),
    spendCeilingCents: v.number(),
    resetAt: v.number(),
  }),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const snapshot = await getBillingSnapshot(ctx, user._id, user.email);
    const period = await ensureCreditPeriod(ctx, {
      ownerUserId: user._id,
      planKey: snapshot.planKey,
      status: snapshot.status,
    });
    return {
      periodKey: period.periodKey,
      planKey: period.planKey,
      isAdmin: snapshot.isAdmin,
      isUnlimitedCredits: snapshot.isUnlimitedCredits,
      creditsLimit: period.creditsLimit,
      creditsUsed: period.creditsUsed,
      creditsRemaining: Math.max(0, period.creditsLimit - period.creditsUsed),
      estimatedCostCents: period.estimatedCostCents,
      spendCeilingCents: period.spendCeilingCents,
      resetAt: period.resetAt,
    };
  },
});

export const activity = query({
  args: {
    days: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      date: v.string(),
      credits: v.number(),
      estimatedCostCents: v.number(),
      eventCount: v.number(),
      featureCounts: featureCountValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const dayCount = Math.max(1, Math.min(366, Math.floor(args.days ?? 365)));
    const now = new Date();
    const end = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    );
    const start = end - dayCount * 24 * 60 * 60 * 1000;
    const rows = new Map<
      string,
      {
        date: string;
        credits: number;
        estimatedCostCents: number;
        eventCount: number;
        featureCounts: ReturnType<typeof emptyFeatureCounts>;
      }
    >();

    for (let offset = 0; offset < dayCount; offset += 1) {
      const timestamp = start + offset * 24 * 60 * 60 * 1000;
      const date = new Date(timestamp).toISOString().slice(0, 10);
      rows.set(date, {
        date,
        credits: 0,
        estimatedCostCents: 0,
        eventCount: 0,
        featureCounts: emptyFeatureCounts(),
      });
    }

    const ledger = ctx.db
      .query("providerUsageLedger")
      .withIndex("by_owner_created", (q) =>
        q.eq("ownerUserId", user._id).gte("createdAt", start).lt("createdAt", end),
      );

    for await (const event of ledger) {
      const date = new Date(event.createdAt).toISOString().slice(0, 10);
      const row = rows.get(date);
      if (!row) continue;
      row.credits += event.credits;
      row.estimatedCostCents += event.estimatedCostCents;
      row.eventCount += 1;
      row.featureCounts[event.feature] += 1;
    }

    return Array.from(rows.values());
  },
});
