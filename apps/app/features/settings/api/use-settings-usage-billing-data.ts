"use client";

import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@aqsha/convex/api";
import { readableBillingError } from "../lib/settings-format";
import type { Plan, ProductKey } from "../lib/types";

export type UsageRangeDays = 30 | 90 | 365;

export function useSettingsUsageBillingData() {
  const { isAuthenticated } = useConvexAuth();
  const [usageDays, setUsageDays] = useState<UsageRangeDays>(30);
  const current = useQuery(api.billing.current.get, isAuthenticated ? {} : "skip");
  const plansResult = useQuery(api.billing.products.list, isAuthenticated ? {} : "skip");
  const plans = plansResult?.map(normalizePlan);
  const activity = useQuery(
    api.billing.usage.activity,
    isAuthenticated ? { days: usageDays } : "skip",
  );
  const createCheckout = useAction(api.billing.checkout.create);
  const createPortal = useAction(api.billing.portal.create);
  const changeSubscription = useAction(api.billing.subscription.change);
  const cancelSubscriptionAction = useAction(api.billing.subscription.cancel);
  const [pendingKey, setPendingKey] = useState<ProductKey | "portal" | "cancel" | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);

  const openCheckout = async (productKey: ProductKey) => {
    setPendingKey(productKey);
    setBillingError(null);
    setBillingNotice(null);
    try {
      const origin = window.location.origin;
      const { url } = await createCheckout({
        productKey,
        origin,
        successUrl: `${origin}/settings/usage-billing?checkout=success`,
      });
      window.location.assign(url);
    } catch (error) {
      setBillingError(readableBillingError(error));
    } finally {
      setPendingKey(null);
    }
  };

  const openPortal = async () => {
    setPendingKey("portal");
    setBillingError(null);
    setBillingNotice(null);
    try {
      const { url } = await createPortal({ returnUrl: window.location.href });
      window.location.assign(url);
    } catch (error) {
      setBillingError(readableBillingError(error));
    } finally {
      setPendingKey(null);
    }
  };

  const selectProduct = async (productKey: ProductKey) => {
    if (!current || current.planKey === "free" || !current.billingPortalAvailable) {
      await openCheckout(productKey);
      return;
    }

    setPendingKey(productKey);
    setBillingError(null);
    setBillingNotice(null);
    try {
      await changeSubscription({ productKey });
      setBillingNotice("Paket langganan berhasil diperbarui.");
    } catch (error) {
      setBillingError(readableBillingError(error));
    } finally {
      setPendingKey(null);
    }
  };

  const cancelSubscription = async () => {
    setPendingKey("cancel");
    setBillingError(null);
    setBillingNotice(null);
    try {
      await cancelSubscriptionAction({ revokeImmediately: false });
      setBillingNotice("Langganan akan dibatalkan di akhir periode berjalan.");
    } catch (error) {
      setBillingError(readableBillingError(error));
    } finally {
      setPendingKey(null);
    }
  };

  return {
    current,
    plans,
    activity,
    usageDays,
    setUsageDays,
    pendingKey,
    billingError,
    billingNotice,
    openCheckout,
    selectProduct,
    openPortal,
    cancelSubscription,
  };
}

const productKeys = new Set<string>([
  "starterMonthly",
  "starterYearly",
  "plusMonthly",
  "plusYearly",
]);

function normalizePlan(plan: Omit<Plan, "products"> & {
  products: Array<Omit<Plan["products"][number], "key"> & { key: string }>;
}): Plan {
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
