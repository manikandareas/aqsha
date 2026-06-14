"use client";

import { useState } from "react";
import { api } from "@aqsha/convex/api";
import { useConvexActionState, useConvexQueryData } from "@/lib/convex-query";
import { readableBillingError } from "../lib/settings-format";
import type { Plan, ProductKey } from "../lib/types";
import { useConvexAuth } from "convex/react";

type PendingKey = ProductKey | "portal" | "cancel" | null;
type UsageRangeDays = 30 | 90 | 365;

export function useSettingsUsageBillingData() {
  const { isAuthenticated } = useConvexAuth();
  const [usageRangeDays, setUsageRangeDays] = useState<UsageRangeDays>(90);
  const current = useConvexQueryData(
    api.billing.current.get,
    isAuthenticated ? {} : "skip",
  );
  const plansResult = useConvexQueryData(
    api.billing.products.list,
    isAuthenticated ? {} : "skip",
  );
  const plans = plansResult?.map(normalizePlan);
  const activity = useConvexQueryData(
    api.billing.usage.activity,
    isAuthenticated ? { days: usageRangeDays } : "skip",
  );
  const createCheckout = useConvexActionState(api.billing.checkout.create);
  const createPortal = useConvexActionState(api.billing.portal.create);
  const changeSubscription = useConvexActionState(
    api.billing.subscription.change,
  );
  const cancelSubscription = useConvexActionState(
    api.billing.subscription.cancel,
  );
  const [pendingKey, setPendingKey] = useState<PendingKey>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);

  const openCheckout = async (productKey: ProductKey) => {
    setPendingKey(productKey);
    setBillingError(null);
    setBillingNotice(null);
    try {
      const origin = window.location.origin;
      const { url } = await createCheckout.mutateAsync({
        productKey,
        origin,
        successUrl: `${origin}/app/settings/usage-billing?checkout=success`,
      });
      window.location.assign(url);
      setPendingKey(null);
    } catch (error) {
      setBillingError(readableBillingError(error));
      setPendingKey(null);
    }
  };

  const changePlan = async (productKey: ProductKey) => {
    setPendingKey(productKey);
    setBillingError(null);
    setBillingNotice(null);
    try {
      await changeSubscription.mutateAsync({ productKey });
      setBillingNotice(
        "Perubahan paket dikirim ke Polar. Status akan diperbarui setelah webhook diterima.",
      );
      setPendingKey(null);
    } catch (error) {
      setBillingError(readableBillingError(error));
      setPendingKey(null);
    }
  };

  const cancelPlan = async () => {
    setPendingKey("cancel");
    setBillingError(null);
    setBillingNotice(null);
    try {
      await cancelSubscription.mutateAsync({ revokeImmediately: false });
      setBillingNotice("Langganan akan dibatalkan di akhir periode berjalan.");
      setPendingKey(null);
    } catch (error) {
      setBillingError(readableBillingError(error));
      setPendingKey(null);
    }
  };

  const openPortal = async () => {
    setPendingKey("portal");
    setBillingError(null);
    setBillingNotice(null);
    try {
      const { url } = await createPortal.mutateAsync({
        returnUrl: window.location.href,
      });
      window.location.assign(url);
      setPendingKey(null);
    } catch (error) {
      setBillingError(readableBillingError(error));
      setPendingKey(null);
    }
  };

  return {
    current,
    plans,
    activity,
    pendingKey,
    billingError,
    billingNotice,
    usageRangeDays,
    setUsageRangeDays,
    openCheckout,
    changePlan,
    cancelPlan,
    openPortal,
  };
}

export type { PendingKey, UsageRangeDays };

const productKeys = new Set<string>([
  "starterMonthly",
  "starterYearly",
  "plusMonthly",
  "plusYearly",
]);

function normalizePlan(
  plan: Omit<Plan, "products"> & {
    products: Array<Omit<Plan["products"][number], "key"> & { key: string }>;
  },
): Plan {
  return {
    ...plan,
    products: plan.products.flatMap((product) => {
      if (!isProductKey(product.key)) return [];
      return [{ ...product, key: product.key }];
    }),
  };
}

function isProductKey(value: string): value is ProductKey {
  return productKeys.has(value);
}
