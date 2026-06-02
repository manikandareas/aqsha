"use client";

import { CalendarRangeIcon, CreditCardIcon, Loader2Icon } from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";
import type { PendingKey } from "../api/use-settings-usage-billing-data";
import { formatIdr } from "../lib/settings-format";
import type { BillingCurrent, Plan, ProductKey } from "../lib/types";
import { getPlanBillingAction } from "../utils/settings-summary";
import { SettingsSegmentedControl } from "./settings-card";

export type BillingInterval = "month" | "year";

export function PlanIntervalSelector({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
}) {
  return (
    <SettingsSegmentedControl>
      {(["month", "year"] as const).map((interval) => (
        <button
          key={interval}
          type="button"
          onClick={() => onChange(interval)}
          className={`rounded-md px-3 py-1.5 text-[12px] font-medium ${
            value === interval
              ? "bg-card text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {interval === "month" ? "Bulanan" : "Tahunan"}
        </button>
      ))}
    </SettingsSegmentedControl>
  );
}

export function PlanBillingRow({
  plan,
  interval,
  current,
  pendingKey,
  onCheckout,
  onChangePlan,
}: {
  plan: Plan;
  interval: BillingInterval;
  current: Pick<
    BillingCurrent,
    "planKey" | "billingInterval" | "isAdmin" | "canChangeSubscription"
  >;
  pendingKey: PendingKey;
  onCheckout: (productKey: ProductKey) => void;
  onChangePlan: (productKey: ProductKey) => void;
}) {
  const product = plan.products.find((item) => item.interval === interval);
  const productKey = product?.key;
  const active =
    current.planKey === plan.key &&
    (plan.key === "free" || current.billingInterval === interval);
  const configured = product?.configured ?? plan.key === "free";
  const action = getPlanBillingAction({
    plan,
    productKey,
    active,
    configured,
    current,
  });
  const pending = productKey ? pendingKey === productKey : false;
  const price = interval === "month" ? plan.monthlyPriceIdr : plan.annualPriceIdr;
  const billingLabel = interval === "month" ? "/bulan" : "/tahun";

  const click = () => {
    if (action.kind === "change") {
      onChangePlan(action.productKey);
      return;
    }
    if (action.kind === "checkout") {
      onCheckout(action.productKey);
    }
  };

  return (
    <div className="grid gap-3 rounded-xl border border-border/70 bg-card px-4 py-3.5 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-[14px] font-semibold text-foreground">{plan.label}</h3>
          {active ? (
            <span className="rounded-md border border-mint-soft-border bg-mint-soft px-2 py-0.5 text-[11px] font-medium text-mint-foreground">
              Aktif
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {formatIdr(price)}
          {billingLabel} · {plan.monthlyCredits.toLocaleString("id-ID")} kredit/bulan
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {plan.features.slice(0, 2).join(" · ")}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant={active || plan.key === "free" ? "outline" : "default"}
        onClick={click}
        disabled={
          action.kind === "active" ||
          action.kind === "disabled" ||
          action.kind === "blocked" ||
          pending
        }
        className="h-9 rounded-lg text-[13px]"
      >
        {pending ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : action.kind === "change" ? (
          <CalendarRangeIcon className="size-3.5" />
        ) : (
          <CreditCardIcon className="size-3.5" />
        )}
        {action.label}
      </Button>
    </div>
  );
}
