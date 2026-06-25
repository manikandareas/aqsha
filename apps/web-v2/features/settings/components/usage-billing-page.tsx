"use client";

import { useState } from "react";
import { Badge } from "@aqsha/ui/components/badge";
import { Button } from "@aqsha/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@aqsha/ui/components/card";
import { CheckIcon, ExternalLinkIcon, Loader2Icon } from "@aqsha/ui/icons";
import { readableApiErrorMessage } from "@/lib/api-error";
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
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Penggunaan & tagihan</h1>
        <p className="text-sm text-muted-foreground">Kelola paket, pantau kredit, dan buka portal billing.</p>
      </div>

      {/* Paket aktif + aksi */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Paket aktif</CardTitle>
            <CardDescription>
              {billing.isPending ? "Memuat…" : billing.data ? billing.data.planLabel : "Tidak tersedia"}
            </CardDescription>
          </div>
          {billing.data ? (
            <Badge variant={billing.data.planKey === "free" ? "secondary" : "default"}>
              {billing.data.isAdmin ? "Admin" : billing.data.status}
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {billing.isPending ? (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2Icon className="size-5 animate-spin" />
            </div>
          ) : billing.data ? (
            <CreditMeter
              creditsUsed={billing.data.creditsUsed}
              creditsLimit={billing.data.creditsLimit}
              creditsRemaining={billing.data.creditsRemaining}
              unlimited={billing.data.isUnlimitedCredits}
              resetAt={billing.data.resetAt}
            />
          ) : (
            <p className="text-sm text-destructive">
              {readableApiErrorMessage(billing.error, "Tidak dapat memuat billing.")}
            </p>
          )}
          {billing.data?.cancelAtPeriodEnd ? (
            <p className="text-xs text-amber-600">Langganan akan berakhir pada akhir periode berjalan.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {billing.data?.billingPortalAvailable ? (
              <Button variant="outline" size="sm" onClick={() => portal.mutate()} disabled={portal.isPending}>
                {portal.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <ExternalLinkIcon className="size-4" />}
                Kelola tagihan
              </Button>
            ) : null}
            {billing.data?.canCancelSubscription ? (
              <Button variant="ghost" size="sm" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                {cancel.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Batalkan langganan
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Daftar plan + produk */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.isPending ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-48 animate-pulse bg-muted/40" />
          ))
        ) : !plans.data ? (
          <p className="text-sm text-destructive sm:col-span-2 lg:col-span-4">
            {readableApiErrorMessage(plans.error, "Tidak dapat memuat daftar paket.")}
          </p>
        ) : (
          plans.data.map((plan) => {
              const isCurrent = billing.data?.planKey === plan.key;
              return (
                <Card key={plan.key} className={isCurrent ? "border-primary" : undefined}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{plan.label}</CardTitle>
                      {isCurrent ? <Badge>Saat ini</Badge> : null}
                    </div>
                    <CardDescription>{formatIdr(plan.monthlyPriceIdr)}{plan.monthlyPriceIdr > 0 ? "/bln" : ""}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {plan.products.length > 0 ? (
                      <div className="flex flex-col gap-2 pt-1">
                        {plan.products.map((product) => (
                          <Button
                            key={product.key}
                            variant={product.interval === "month" ? "default" : "outline"}
                            size="sm"
                            disabled={!product.configured || pendingPurchase || (isCurrent && product.key === billing.data?.productKey)}
                            onClick={() => onSelectProduct(product.key)}
                          >
                            {pendingPurchase ? <Loader2Icon className="size-4 animate-spin" /> : null}
                            {product.interval === "month"
                              ? `${formatIdr(product.displayPriceIdr)}/bln`
                              : `${formatIdr(product.displayPriceIdr)}/thn`}
                            {!product.configured ? " (belum tersedia)" : ""}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Paket dasar — tidak perlu pembayaran.</p>
                    )}
                  </CardContent>
                </Card>
              );
            })
        )}
      </div>

      {/* Usage timeseries dengan toggle window */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Penggunaan</CardTitle>
            <CardDescription>Kredit terpakai per hari</CardDescription>
          </div>
          <div className="flex gap-1">
            {WINDOWS.map((w) => (
              <Button
                key={w}
                variant={days === w ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setDays(w)}
              >
                {w}h
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {usage.isPending ? (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2Icon className="size-5 animate-spin" />
            </div>
          ) : usage.data ? (
            <UsageChart days={usage.data} />
          ) : (
            <p className="text-sm text-muted-foreground">Tidak dapat memuat penggunaan.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
