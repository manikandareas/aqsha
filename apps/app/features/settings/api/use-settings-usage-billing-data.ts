"use client";

import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@aqsha/convex/api";
import { readableBillingError } from "../lib/settings-format";
import type { ProductKey } from "../lib/types";

export function useSettingsUsageBillingData() {
  const { isAuthenticated } = useConvexAuth();
  const current = useQuery(api.billing.current.get, isAuthenticated ? {} : "skip");
  const plans = useQuery(api.billing.products.list, isAuthenticated ? {} : "skip");
  const activity = useQuery(api.billing.usage.activity, isAuthenticated ? { days: 365 } : "skip");
  const createCheckout = useAction(api.billing.checkout.create);
  const createPortal = useAction(api.billing.portal.create);
  const [pendingKey, setPendingKey] = useState<ProductKey | "portal" | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);

  const openCheckout = async (productKey: ProductKey) => {
    setPendingKey(productKey);
    setBillingError(null);
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
    openCheckout,
    openPortal,
  };
}
