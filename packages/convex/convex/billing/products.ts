import { v } from "convex/values";
import { action, query } from "../_generated/server";
import {
  PLAN_CATALOG,
  PRODUCT_CATALOG,
  PRODUCT_KEYS,
  PUBLIC_PLAN_KEYS,
  type PublicPlanKey,
} from "./catalog";
import { configuredProductId } from "./polar";
import { polar } from "./polar";
import { productKeyValidator } from "./validators";

const planValidator = v.object({
  key: v.union(v.literal("free"), v.literal("starter"), v.literal("plus")),
  label: v.string(),
  monthlyPriceIdr: v.number(),
  annualPriceIdr: v.number(),
  monthlyCredits: v.number(),
  deepResearchRuns: v.number(),
  workspaceLimit: v.number(),
  libraryItemLimit: v.number(),
  providerSpendCeilingCents: v.number(),
  features: v.array(v.string()),
  products: v.array(
    v.object({
      key: productKeyValidator,
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
    return PUBLIC_PLAN_KEYS.map((planKey: PublicPlanKey) => {
      const plan = PLAN_CATALOG[planKey];
      return {
        ...plan,
        key: planKey,
        products:
          planKey === "free"
            ? []
            : PRODUCT_KEYS.filter((key) => PRODUCT_CATALOG[key].planKey === planKey).map(
                (key) => {
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
      };
    });
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
