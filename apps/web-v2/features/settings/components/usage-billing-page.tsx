"use client";

import { useState } from "react";
import { Button } from "@aqsha/ui/components/button";
import { CheckIcon, ExternalLinkIcon, Loader2Icon } from "@aqsha/ui/icons";
import { readableApiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import {
  type ProductKey,
  useBillingCurrent,
  useBillingPlans,
  useCancelSubscription,
  useChangeSubscription,
  useCheckout,
  usePortal,
  useUsageActivity,
} from "../api";
import { CreditMeter, formatIdr, UsageChart } from "./bits";
import {
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelFooter,
  SettingsPanelHeader,
  SettingsPill,
  SettingsSegmentedControl,
} from "./settings-card";
import { SettingsHeader } from "./settings-header";

const WINDOWS = [30, 90, 365] as const;

export function UsageBillingPage() {
  const billing = useBillingCurrent();
  const plans = useBillingPlans();
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const usage = useUsageActivity(days);

  const checkout = useCheckout();
  const change = useChangeSubscription();
  const cancel = useCancelSubscription();
  const portal = usePortal();

  const hasSubscription = billing.data?.canChangeSubscription ?? false;
  const pendingPurchase = checkout.isPending || change.isPending;

  function onSelectProduct(productKey: ProductKey) {
    if (hasSubscription) change.mutate(productKey);
    else checkout.mutate(productKey);
  }

  return (
    <>
      <SettingsHeader
        section="usage-billing"
        title="Penggunaan & tagihan"
        description="Kelola paket, pantau kredit, dan buka portal billing."
      />

      {/* Paket aktif + aksi */}
      <SettingsPanel>
        <SettingsPanelHeader
          title="Paket aktif"
          description={billing.isPending ? "Memuat…" : billing.data ? billing.data.planLabel : "Tidak tersedia"}
          action={
            billing.data ? (
              <SettingsPill>{billing.data.isAdmin ? "Admin" : billing.data.status}</SettingsPill>
            ) : null
          }
        />
        <SettingsPanelBody className="space-y-3">
          {billing.isPending ? (
            <p className="text-[13px] text-muted-foreground">Memuat billing…</p>
          ) : billing.data ? (
            <CreditMeter
              creditsUsed={billing.data.creditsUsed}
              creditsLimit={billing.data.creditsLimit}
              creditsRemaining={billing.data.creditsRemaining}
              unlimited={billing.data.isUnlimitedCredits}
              resetAt={billing.data.resetAt}
            />
          ) : (
            <p className="text-[13px] text-destructive">
              {readableApiErrorMessage(billing.error, "Tidak dapat memuat billing.")}
            </p>
          )}
          {billing.data?.cancelAtPeriodEnd ? (
            <p className="text-[12px] text-coral-foreground">
              Langganan akan berakhir pada akhir periode berjalan.
            </p>
          ) : null}
        </SettingsPanelBody>
        {billing.data?.billingPortalAvailable || billing.data?.canCancelSubscription ? (
          <SettingsPanelFooter>
            {billing.data?.billingPortalAvailable ? (
              <Button variant="outline" size="sm" onClick={() => portal.mutate()} disabled={portal.isPending}>
                {portal.isPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <ExternalLinkIcon className="size-4" />
                )}
                Kelola tagihan
              </Button>
            ) : null}
            {billing.data?.canCancelSubscription ? (
              <Button variant="ghost" size="sm" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                {cancel.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Batalkan langganan
              </Button>
            ) : null}
          </SettingsPanelFooter>
        ) : null}
      </SettingsPanel>

      {/* Daftar plan + produk */}
      <SettingsPanel>
        <SettingsPanelHeader title="Paket tersedia" description="Pilih paket yang sesuai kebutuhan riset kamu." />
        <SettingsPanelBody>
          {plans.isPending ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-44 animate-pulse rounded-xl border border-border/60 bg-muted/40" />
              ))}
            </div>
          ) : !plans.data ? (
            <p className="text-[13px] text-destructive">
              {readableApiErrorMessage(plans.error, "Tidak dapat memuat daftar paket.")}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {plans.data.map((plan) => {
                const isCurrent = billing.data?.planKey === plan.key;
                return (
                  <div
                    key={plan.key}
                    className={cn(
                      "flex flex-col gap-3 rounded-xl border bg-card p-4",
                      isCurrent ? "border-primary/50 ring-1 ring-primary/20" : "border-border/70",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold tracking-tight text-foreground">{plan.label}</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                          {formatIdr(plan.monthlyPriceIdr)}
                          {plan.monthlyPriceIdr > 0 ? "/bln" : ""}
                        </p>
                      </div>
                      {isCurrent ? <SettingsPill className="border-primary/40 text-primary">Saat ini</SettingsPill> : null}
                    </div>

                    <ul className="space-y-1.5 text-[12px] text-muted-foreground">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                          {f}
                        </li>
                      ))}
                    </ul>

                    {plan.products.length > 0 ? (
                      <div className="mt-auto flex flex-col gap-2 pt-1">
                        {plan.products.map((product) => (
                          <Button
                            key={product.key}
                            variant={product.interval === "month" ? "default" : "outline"}
                            size="sm"
                            disabled={
                              !product.configured ||
                              pendingPurchase ||
                              (isCurrent && product.key === billing.data?.productKey)
                            }
                            onClick={() => onSelectProduct(product.key)}
                          >
                            {pendingPurchase ? <Loader2Icon className="size-4 animate-spin" /> : null}
                            {`${formatIdr(product.displayPriceIdr)}/${product.interval === "month" ? "bln" : "thn"}`}
                            {!product.configured ? " (belum tersedia)" : ""}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-auto text-[12px] text-muted-foreground">Paket dasar — tidak perlu pembayaran.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SettingsPanelBody>
      </SettingsPanel>

      {/* Usage timeseries dengan toggle window */}
      <SettingsPanel>
        <SettingsPanelHeader
          title="Penggunaan"
          description="Kredit terpakai per hari"
          action={
            <SettingsSegmentedControl>
              {WINDOWS.map((w) => {
                const active = days === w;
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setDays(w)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors duration-150",
                      active
                        ? "border border-border/40 bg-card text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {w}h
                  </button>
                );
              })}
            </SettingsSegmentedControl>
          }
        />
        <SettingsPanelBody>
          {usage.isPending ? (
            <p className="text-[13px] text-muted-foreground">Memuat penggunaan…</p>
          ) : usage.data ? (
            <UsageChart days={usage.data} />
          ) : (
            <p className="text-[13px] text-muted-foreground">Tidak dapat memuat penggunaan.</p>
          )}
        </SettingsPanelBody>
      </SettingsPanel>
    </>
  );
}
