"use client";

import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@aqsha/convex/api";
import { readableBillingError } from "../lib/settings-format";
import type { ProductKey } from "../lib/types";

type PendingKey = ProductKey | "portal" | "cancel" | null;
type UsageRangeDays = 30 | 90 | 365;

export function useSettingsUsageBillingData() {
  const { isAuthenticated } = useConvexAuth();
  const [usageRangeDays, setUsageRangeDays] = useState<UsageRangeDays>(90);
  const current = useQuery(api.billing.current.get, isAuthenticated ? {} : "skip");
  const plans = useQuery(api.billing.products.list, isAuthenticated ? {} : "skip");
  const activity = useQuery(
    api.billing.usage.activity,
    isAuthenticated ? { days: usageRangeDays } : "skip",
  );
  const createCheckout = useAction(api.billing.checkout.create);
  const createPortal = useAction(api.billing.portal.create);
  const changeSubscription = useAction(api.billing.subscription.change);
  const cancelSubscription = useAction(api.billing.subscription.cancel);
  const [pendingKey, setPendingKey] = useState<PendingKey>(null);
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

  const changePlan = async (productKey: ProductKey) => {
    setPendingKey(productKey);
    setBillingError(null);
    setBillingNotice(null);
    try {
      await changeSubscription({ productKey });
      setBillingNotice("Perubahan paket dikirim ke Polar. Status akan diperbarui setelah webhook diterima.");
    } catch (error) {
      setBillingError(readableBillingError(error));
    } finally {
      setPendingKey(null);
    }
  };

  const cancelPlan = async () => {
    setPendingKey("cancel");
    setBillingError(null);
    setBillingNotice(null);
    try {
      await cancelSubscription({ revokeImmediately: false });
      setBillingNotice("Langganan akan dibatalkan di akhir periode berjalan.");
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
