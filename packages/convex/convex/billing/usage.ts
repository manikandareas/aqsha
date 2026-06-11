import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { ensureCreditPeriod, getBillingSnapshot } from "./entitlements";
import {
  emptyFeatureCounts,
  featureCountValidator,
  type FeatureCounts,
} from "./usageShape";

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
    // Exclusive end-of-window timestamp == UTC midnight after today, matching
    // the original ledger-scan window so output stays byte-identical.
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
        featureCounts: FeatureCounts;
      }
    >();

    // Seed every day in the window (chronological insertion order) with a zero
    // row so the output always covers the full range, even days with no usage.
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

    // ISO "YYYY-MM-DD" sorts lexicographically == chronologically, so a string
    // range over the rollup index returns exactly the in-window days. `start`
    // is inclusive (first seeded day); `end` is the exclusive window edge, so
    // the last in-window day is the UTC day of `end - 1ms`.
    const startDateStr = new Date(start).toISOString().slice(0, 10);
    const endDateStr = new Date(end - 1).toISOString().slice(0, 10);

    const rollup = ctx.db
      .query("usageDailyRollup")
      .withIndex("by_owner_date", (q) =>
        q
          .eq("ownerUserId", user._id)
          .gte("date", startDateStr)
          .lte("date", endDateStr),
      );

    for await (const day of rollup) {
      const row = rows.get(day.date);
      if (!row) continue;
      row.credits = day.credits;
      row.estimatedCostCents = day.estimatedCostCents;
      row.eventCount = day.eventCount;
      row.featureCounts = {
        normal_chat: day.featureCounts.normal_chat,
        pro_chat: day.featureCounts.pro_chat,
        cited_answer: day.featureCounts.cited_answer,
        deep_research: day.featureCounts.deep_research,
        external_search: day.featureCounts.external_search,
        // Optional on rows written before the feature existed — coalesce to 0.
        sandbox_compute: day.featureCounts.sandbox_compute ?? 0,
      };
    }

    return Array.from(rows.values());
  },
});
