import { v } from "convex/values";
import { action } from "../_generated/server";
import { getPolarUserInfo, polar } from "./polar";

export const create = action({
  args: {
    returnUrl: v.optional(v.string()),
  },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args) => {
    const { userId } = await getPolarUserInfo(ctx);
    return await polar.createCustomerPortalSession(ctx, {
      userId,
      returnUrl: args.returnUrl,
    });
  },
});
