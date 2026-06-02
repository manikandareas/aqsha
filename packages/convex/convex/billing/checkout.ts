import { v } from "convex/values";
import { action } from "../_generated/server";
import { throwAppError } from "../lib/appError";
import { PRODUCT_CATALOG } from "./catalog";
import { configuredProductId, getPolarUserInfo, polar } from "./polar";

const productKeyValidator = v.union(
  v.literal("starterMonthly"),
  v.literal("starterYearly"),
  v.literal("plusMonthly"),
  v.literal("plusYearly"),
);

export const create = action({
  args: {
    productKey: productKeyValidator,
    origin: v.string(),
    successUrl: v.string(),
  },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args): Promise<{ url: string }> => {
    const product = PRODUCT_CATALOG[args.productKey];
    if (!product) {
      throwAppError({
        code: "billing_product_unknown",
        message: "Unknown billing product",
      });
    }
    const productId = configuredProductId(args.productKey);
    if (!productId) {
      throwAppError({
        code: "billing_product_not_configured",
        message: "Polar product is not configured",
      });
    }

    const { userId, email } = await getPolarUserInfo(ctx);
    if (isReservedEmail(email)) {
      throwAppError({
        code: "billing_email_invalid",
        message:
          "Polar checkout requires a real email domain. Update your account email before subscribing.",
        field: "email",
      });
    }
    const checkout: { url: string } = await polar.createCheckoutSession(ctx, {
      productIds: [productId],
      userId,
      email,
      origin: args.origin,
      successUrl: args.successUrl,
      metadata: {
        userId,
        productKey: args.productKey,
        planKey: product.planKey,
        interval: product.interval,
      },
    });
    return { url: checkout.url };
  },
});

function isReservedEmail(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return (
    domain === "localhost" ||
    domain.endsWith(".local") ||
    domain.endsWith(".localhost") ||
    domain.endsWith(".test") ||
    domain.endsWith(".invalid") ||
    domain.endsWith(".example")
  );
}
