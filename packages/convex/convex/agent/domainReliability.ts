import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

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
      await ctx.db.patch("domainReliability", existing._id, {
        successCount: existing.successCount + (args.success ? 1 : 0),
        failureCount: existing.failureCount + (args.success ? 0 : 1),
        lastFailureReason: args.success ? existing.lastFailureReason : args.failureReason,
        lastSeenAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("domainReliability", {
        domain: args.domain,
        successCount: args.success ? 1 : 0,
        failureCount: args.success ? 0 : 1,
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
    const all = await ctx.db.query("domainReliability").collect();
    return all
      .filter((row) => {
        const total = row.successCount + row.failureCount;
        return total >= MIN_OBSERVATIONS && row.failureCount / total > UNRELIABLE_THRESHOLD;
      })
      .map((row) => row.domain);
  },
});
