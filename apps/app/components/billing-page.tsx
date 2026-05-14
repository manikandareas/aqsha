"use client";

import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import {
  ArrowLeftIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  GaugeIcon,
  Loader2Icon,
} from "lucide-react";
import { useState } from "react";
import { api } from "@aqsha/convex/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProductKey = "starterMonthly" | "starterYearly" | "plusMonthly" | "plusYearly";

export function BillingPage() {
  const current = useQuery(api.billing.current.get, {});
  const plans = useQuery(api.billing.products.list, {});
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
        successUrl: `${origin}/billing?checkout=success`,
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
    try {
      const { url } = await createPortal({ returnUrl: window.location.href });
      window.location.assign(url);
    } finally {
      setPendingKey(null);
    }
  };

  if (!current || !plans) {
    return (
      <main className="grid min-h-svh place-items-center bg-background text-foreground">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const usagePercent = Math.min(
    100,
    Math.round((current.creditsUsed / Math.max(1, current.creditsLimit)) * 100),
  );

  return (
    <main className="min-h-svh bg-background px-4 py-5 text-foreground sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="rounded-[8px]">
            <Link href="/">
              <ArrowLeftIcon className="size-4" />
              Kembali
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openPortal}
            disabled={!current.billingPortalAvailable || pendingKey === "portal"}
            className="rounded-[8px]"
          >
            {pendingKey === "portal" ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <CreditCardIcon className="size-4" />
            )}
            {current.isAdmin ? "Manage existing subscription" : "Manage portal"}
          </Button>
        </header>

        <section className="grid gap-4 rounded-[14px] border border-border bg-card p-5 shadow-none md:grid-cols-[1fr_20rem]">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--sky-soft-border)] bg-[var(--sky-soft)] px-3 py-1 text-[12px] font-semibold text-primary">
              <GaugeIcon className="size-3.5" />
              Current plan
            </div>
            <h1 className="font-heading text-3xl font-extrabold leading-tight">
              {current.planLabel}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {current.isUnlimitedCredits
                ? "Admin access melewati quota billing, sementara provider usage tetap tercatat."
                : "Credits reset bulanan walaupun billing tahunan. Jika credits habis, Aqsha menolak sebelum memanggil model atau provider eksternal."}
            </p>
          </div>
          <div className="rounded-[12px] border border-border bg-background p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-muted-foreground">Usage</p>
                <p className="mt-1 text-2xl font-bold">
                  {current.isUnlimitedCredits
                    ? `${current.creditsUsed} tracked`
                    : `${current.creditsUsed} / ${current.creditsLimit}`}
                </p>
              </div>
              <span className="text-[12px] font-semibold text-muted-foreground">
                reset {new Date(current.resetAt).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </div>
            {current.isUnlimitedCredits ? null : (
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            )}
            <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
              Estimated provider cost: ${(current.estimatedCostCents / 100).toFixed(2)}
              {" "}of ${(current.providerSpendCeilingCents / 100).toFixed(2)} ceiling.
            </p>
          </div>
        </section>

        {billingError ? (
          <div className="rounded-[12px] border border-[var(--coral-soft-border)] bg-[var(--coral-soft)] px-4 py-3 text-sm font-medium leading-6 text-[var(--coral)]">
            {billingError}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.key}
              className={cn(
                "flex min-h-[420px] flex-col rounded-[14px] border bg-card p-5 shadow-none",
                current.planKey === plan.key
                  ? "border-primary/55"
                  : "border-border",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-heading text-xl font-extrabold">
                    {plan.label}
                  </h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {plan.monthlyCredits.toLocaleString("id-ID")} credits/bulan
                  </p>
                </div>
                {current.planKey === plan.key ? (
                  <span className="rounded-full border border-[var(--mint-soft-border)] bg-[var(--mint-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--mint)]">
                    Aktif
                  </span>
                ) : null}
              </div>

              <div className="mt-5">
                <div className="text-3xl font-bold">
                  {formatIdr(plan.monthlyPriceIdr)}
                  <span className="text-sm font-medium text-muted-foreground">/bulan</span>
                </div>
                {plan.key !== "free" ? (
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {formatIdr(plan.annualPriceIdr)}/tahun, 10 bulan bayar
                  </p>
                ) : (
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Untuk coba Aqsha dan chat ringan.
                  </p>
                )}
              </div>

              <ul className="mt-5 grid gap-2 text-sm leading-6 text-muted-foreground">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto grid gap-2 pt-5">
                {plan.key === "free" ? (
                  <Button disabled className="h-10 rounded-[10px]">
                    Plan default
                  </Button>
                ) : (
                  plan.products.filter((product) => product.configured).map((product) => (
                    <Button
                      key={product.key}
                      type="button"
                      variant={product.interval === "month" ? "default" : "outline"}
                      className="h-10 rounded-[10px]"
                      disabled={pendingKey === product.key}
                      onClick={() => openCheckout(product.key as ProductKey)}
                    >
                      {pendingKey === product.key ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <ExternalLinkIcon className="size-4" />
                      )}
                      {product.interval === "month" ? "Bulanan" : "Tahunan"} ·{" "}
                      {formatIdr(product.displayPriceIdr)}
                    </Button>
                  ))
                )}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

function formatIdr(value: number) {
  if (value === 0) return "Rp0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function readableBillingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("real email domain") || message.includes("valid email")) {
    return "Polar menolak email demo/reserved seperti .local. Daftar atau login dengan email asli, misalnya Gmail, lalu ulangi checkout.";
  }
  if (message.includes("not configured")) {
    return "Product Polar belum dikonfigurasi di Convex env.";
  }
  return "Checkout belum bisa dibuat. Cek konfigurasi Polar dan coba lagi.";
}
