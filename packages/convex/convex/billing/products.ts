import { v } from "convex/values";
import { action, query } from "../_generated/server";
import {
  PLAN_CATALOG,
  PRODUCT_CATALOG,
  PRODUCT_KEYS,
  PUBLIC_PLAN_KEYS,
  type PublicPlanKey,
  type ProductKey,
} from "./catalog";
import { configuredProductId } from "./polar";
import { polar } from "./polar";

const planValidator = v.object({
  key: v.union(v.literal("free"), v.literal("starter"), v.literal("plus")),
  label: v.string(),
  monthlyPriceIdr: v.number(),
  annualPriceIdr: v.number(),
  monthlyCredits: v.number(),
  providerSpendCeilingCents: v.number(),
  features: v.array(v.string()),
  products: v.array(
    v.object({
      key: v.string(),
      polarProductId: v.union(v.string(), v.null()),
      interval: v.union(v.literal("month"), v.literal("year")),
      displayPriceIdr: v.number(),
      configured: v.boolean(),
    }),
  ),
});

export const list = query({
  args: {},
  returns: v.array(planValidator),
  handler: async () => {
    return PUBLIC_PLAN_KEYS.map((planKey) => PLAN_CATALOG[planKey]).map((plan) => ({
      ...plan,
      key: plan.key as PublicPlanKey,
      products:
        plan.key === "free"
          ? []
          : PRODUCT_KEYS.filter((key) => PRODUCT_CATALOG[key].planKey === plan.key).map(
              (key: ProductKey) => {
                const polarProductId = configuredProductId(key);
                return {
                  key,
                  polarProductId,
                  interval: PRODUCT_CATALOG[key].interval,
                  displayPriceIdr: PRODUCT_CATALOG[key].displayPriceIdr,
                  configured: Boolean(polarProductId),
                };
              },
            ),
    }));
  },
});

export const sync = action({
  args: {},
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx) => {
    await polar.syncProducts(ctx);
    return { ok: true };
  },
});
