import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { rateLimiter } from "../limits";

const statusValidator = v.object({
  ok: v.boolean(),
  retryAt: v.union(v.number(), v.null()),
  serverTime: v.number(),
});

export const getSendStatus = query({
  args: {},
  returns: statusValidator,
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const serverTime = Date.now();
    const status = await rateLimiter.check(ctx, "sendMessage", {
      key: user._id,
    });

    return {
      ok: status.ok,
      retryAt: status.ok ? null : serverTime + status.retryAfter,
      serverTime,
    };
  },
});

export const getServerTime = query({
  args: {},
  returns: v.number(),
  handler: async () => Date.now(),
});
