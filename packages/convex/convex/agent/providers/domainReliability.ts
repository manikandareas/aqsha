import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";

const UNRELIABLE_THRESHOLD = 0.7;
const MIN_OBSERVATIONS = 3;

export const recordOutcome = internalMutation({
  args: {
    domain: v.string(),
    success: v.boolean(),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("domainReliability")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .unique();

    if (existing) {
      const successCount = existing.successCount + (args.success ? 1 : 0);
      const failureCount = existing.failureCount + (args.success ? 0 : 1);
      const total = successCount + failureCount;
      const unreliable =
        total >= MIN_OBSERVATIONS && failureCount / total > UNRELIABLE_THRESHOLD;
      await ctx.db.patch("domainReliability", existing._id, {
        successCount,
        failureCount,
        unreliable,
        lastFailureReason: args.success ? existing.lastFailureReason : args.failureReason,
        lastSeenAt: now,
        updatedAt: now,
      });
    } else {
      const successCount = args.success ? 1 : 0;
      const failureCount = args.success ? 0 : 1;
      const total = successCount + failureCount;
      const unreliable =
        total >= MIN_OBSERVATIONS && failureCount / total > UNRELIABLE_THRESHOLD;
      await ctx.db.insert("domainReliability", {
        domain: args.domain,
        successCount,
        failureCount,
        unreliable,
        lastFailureReason: args.success ? undefined : args.failureReason,
        lastSeenAt: now,
        updatedAt: now,
      });
    }
  },
});

export const listUnreliableDomains = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("domainReliability")
      .withIndex("by_unreliable", (q) => q.eq("unreliable", true))
      .collect();
    return rows.map((row) => row.domain);
  },
});
