"use client";

import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatIdr } from "../lib/settings-format";
import type { BillingCurrent, BillingInterval, Plan, ProductKey } from "../lib/types";

export function PlanCards({
  current,
  plans,
  pendingKey,
  onCheckout,
  compact,
  selectedInterval,
  onIntervalChange,
  currentProductKey,
  disabled,
}: {
  current: BillingCurrent;
  plans: Plan[];
  pendingKey: ProductKey | "portal" | "cancel" | null;
  onCheckout: (productKey: ProductKey) => void;
  compact?: boolean;
  selectedInterval?: BillingInterval;
  onIntervalChange?: (interval: BillingInterval) => void;
  currentProductKey?: string | null;
  disabled?: boolean;
}) {
  const visiblePlans = plans.filter((plan) => (compact ? plan.key !== "free" : true));

  return (
    <div className="grid gap-4">
      {selectedInterval && onIntervalChange ? (
        <IntervalSelector value={selectedInterval} onChange={onIntervalChange} />
      ) : null}
      <div className={cn("grid gap-3", compact ? "md:grid-cols-2" : "lg:grid-cols-3 xl:grid-cols-1")}>
        {visiblePlans.map((plan) => (
          <PlanCard
            key={plan.key}
            current={current}
            plan={plan}
            pendingKey={pendingKey}
            onCheckout={onCheckout}
            compact={compact}
            selectedInterval={selectedInterval}
            currentProductKey={currentProductKey}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

function PlanCard({
  current,
  plan,
  pendingKey,
  onCheckout,
  compact,
  selectedInterval,
  currentProductKey,
  disabled,
}: {
  current: BillingCurrent;
  plan: Plan;
  pendingKey: ProductKey | "portal" | "cancel" | null;
  onCheckout: (productKey: ProductKey) => void;
  compact?: boolean;
  selectedInterval?: BillingInterval;
  currentProductKey?: string | null;
  disabled?: boolean;
}) {
  const products = selectedInterval
    ? plan.products.filter((product) => product.interval === selectedInterval)
    : plan.products.filter((product) => product.configured);
  const displayPrice = selectedInterval
    ? products[0]?.displayPriceIdr ?? 0
    : plan.monthlyPriceIdr;

  return (
    <article
      className={cn(
        "rounded-[14px] border bg-card p-4",
        current.planKey === plan.key ? "border-primary/60" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-xl font-extrabold">{plan.label}</h3>
          <p className="text-[12px] text-muted-foreground">
            {plan.monthlyCredits.toLocaleString("id-ID")} credits/bulan
          </p>
        </div>
        {current.planKey === plan.key ? (
          <span className="rounded-full border border-mint-soft-border bg-mint-soft px-2 py-1 text-[11px] font-semibold text-mint-foreground">
            Aktif
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-2xl font-bold">
        {formatIdr(displayPrice)}
        <span className="text-sm font-medium text-muted-foreground">
          /{selectedInterval === "year" ? "tahun" : "bulan"}
        </span>
      </p>
      <ul className="mt-4 grid gap-1.5 text-[13px] leading-5 text-muted-foreground">
        {plan.features.slice(0, compact ? 3 : 4).map((feature) => (
          <li key={feature}>- {feature}</li>
        ))}
      </ul>
      <div className="mt-4 grid gap-2">
        {plan.key === "free" ? (
          <Button disabled className="rounded-[10px]">
            Plan default
          </Button>
        ) : (
          products.map((product) => {
            const active = currentProductKey
              ? currentProductKey === product.key
              : current.planKey === plan.key;
            return (
              <Button
                key={product.key}
                type="button"
                variant={active ? "outline" : product.interval === "month" ? "default" : "outline"}
                onClick={() => onCheckout(product.key)}
                disabled={!product.configured || active || disabled || pendingKey === product.key}
                className="rounded-[10px]"
              >
                {pendingKey === product.key ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : null}
                {buttonLabel({ active, product, selectedInterval })}
              </Button>
            );
          })
        )}
      </div>
    </article>
  );
}

function IntervalSelector({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
}) {
  return (
    <div className="grid w-fit grid-cols-2 gap-1 rounded-xl border border-border/60 bg-muted/50 p-1">
      {(["month", "year"] as const).map((interval) => (
        <button
          key={interval}
          type="button"
          onClick={() => onChange(interval)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-[12px] font-medium",
            value === interval
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground",
          )}
        >
          {interval === "month" ? "Bulanan" : "Tahunan"}
        </button>
      ))}
    </div>
  );
}

function buttonLabel({
  active,
  product,
  selectedInterval,
}: {
  active: boolean;
  product: Plan["products"][number];
  selectedInterval?: BillingInterval;
}) {
  if (active) return "Paket aktif";
  if (!product.configured) return "Belum dikonfigurasi";
  if (selectedInterval) return "Pilih paket";
  return `${product.interval === "month" ? "Bulanan" : "Tahunan"} · ${formatIdr(
    product.displayPriceIdr,
  )}`;
}
