import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCurrentUser } from "./auth";

const themeValidator = v.union(v.literal("light"), v.literal("dark"), v.literal("system"));

export const get = query({
  args: {},
  returns: v.object({
    theme: themeValidator,
    updatedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const preferences = await ctx.db
      .query("userPreferences")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", user._id))
      .unique();

    return {
      theme: preferences?.theme ?? "system",
      updatedAt: preferences?.updatedAt ?? null,
    };
  },
});

export const setTheme = mutation({
  args: {
    theme: themeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch("userPreferences", existing._id, {
        theme: args.theme,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userPreferences", {
        ownerUserId: user._id,
        theme: args.theme,
        createdAt: now,
        updatedAt: now,
      });
    }

    return null;
  },
});
