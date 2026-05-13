"use client";

import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@aqsha/convex/api";
import { readableBillingError } from "../lib/settings-format";
import { summarizeSources } from "../lib/settings-summaries";
import { settingsItemForPath, type SettingsKey } from "../lib/settings-menu";
import type { ProductKey } from "../lib/types";

export function useSettingsData() {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const current = useQuery(api.billing.current.get, isAuthenticated ? {} : "skip");
  const plans = useQuery(api.billing.products.list, isAuthenticated ? {} : "skip");
  const activity = useQuery(api.billing.usage.activity, isAuthenticated ? { days: 365 } : "skip");
  const threadPage = useQuery(
    api.agent.threads.list,
    isAuthenticated ? { paginationOpts: { cursor: null, numItems: 50 } } : "skip",
  );
  const sources = useQuery(api.agent.corpus.list, isAuthenticated ? {} : "skip");
  const createCheckout = useAction(api.billing.checkout.create);
  const createPortal = useAction(api.billing.portal.create);
  const [pendingKey, setPendingKey] = useState<ProductKey | "portal" | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);

  const sourceSummary = useMemo(() => summarizeSources(sources ?? []), [sources]);

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
    viewer,
    current,
    plans,
    activity,
    threads: threadPage?.page,
    sources,
    sourceSummary,
    pendingKey,
    billingError,
    openCheckout,
    openPortal,
  };
}

export function SettingsHeader({ section, title = "Settings" }: { section: SettingsKey; title?: string }) {
  const item = settingsItemForPath(`/settings/${section}`);

  return (
    <header className="grid gap-1">
      <h1 className="font-heading text-2xl font-bold leading-tight text-foreground">{title}</h1>
      <p className="text-[13px] font-medium leading-5 text-muted-foreground">{item.description}</p>
    </header>
  );
}

export function LoadingSettingsPage() {
  return (
    <div className="grid min-h-[42vh] place-items-center rounded-[14px] border border-border bg-card">
      <div className="size-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}

export function BillingErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-[12px] border border-[var(--coral-soft-border)] bg-[var(--coral-soft)] px-4 py-3 text-sm font-medium leading-6 text-[var(--coral)]">
      {message}
    </div>
  );
}
