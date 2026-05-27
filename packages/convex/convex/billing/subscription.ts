import { ConvexError, v } from "convex/values";
import { action } from "../_generated/server";
import { PRODUCT_CATALOG } from "./catalog";
import { configuredProductId, getPolarUserInfo, polar } from "./polar";
import { productKeyValidator } from "./validators";

export const change = action({
  args: {
    productKey: productKeyValidator,
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const product = PRODUCT_CATALOG[args.productKey];
    if (!product) {
      throw new ConvexError("Unknown billing product");
    }
    const productId = configuredProductId(args.productKey);
    if (!productId) {
      throw new ConvexError("Polar product is not configured");
    }

    await getPolarUserInfo(ctx);
    await polar.changeSubscription(ctx, { productId });
    return { ok: true as const };
  },
});

export const cancel = action({
  args: {
    revokeImmediately: v.optional(v.boolean()),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    await getPolarUserInfo(ctx);
    await polar.cancelSubscription(ctx, {
      revokeImmediately: args.revokeImmediately ?? false,
    });
    return { ok: true as const };
  },
});
