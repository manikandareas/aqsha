import { Polar } from "@convex-dev/polar";
import { api, components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { PRODUCT_KEYS, type ProductKey } from "./catalog";

const productIds = Object.fromEntries(
  PRODUCT_KEYS.map((key) => [key, process.env[`POLAR_${toEnvKey(key)}_PRODUCT_ID`] ?? ""]),
) as Record<ProductKey, string>;

export async function getPolarUserInfo(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<{ userId: string; email: string }> {
  const user = await requireCurrentUser(ctx);
  if (!user.email) {
    throw new Error("A verified email is required for billing");
  }
  return {
    userId: user._id,
    email: user.email,
  };
}

export const polar: Polar<DataModel, Record<ProductKey, string>> = new Polar<
  DataModel,
  Record<ProductKey, string>
>(components.polar, {
  getUserInfo: async (ctx): Promise<{ userId: string; email: string }> => {
    const user: { id: string; email: string | null } = await ctx.runQuery(
      api.auth.getCurrentUser,
      {},
    );
    if (!user.email) {
      throw new Error("A verified email is required for billing");
    }
    return {
      userId: user.id,
      email: user.email,
    };
  },
  products: productIds,
});

export const {
  changeCurrentSubscription,
  cancelCurrentSubscription,
  getConfiguredProducts,
  listAllProducts,
  listAllSubscriptions,
  generateCheckoutLink,
  generateCustomerPortalUrl,
} = polar.api();

export function configuredProductId(productKey: ProductKey) {
  const productId = productIds[productKey];
  return productId.trim() ? productId : null;
}

function toEnvKey(key: ProductKey) {
  return key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase();
}
