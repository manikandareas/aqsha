"use client";

import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatIdr } from "../lib/settings-format";
import type { BillingCurrent, Plan, ProductKey } from "../lib/types";

export function PlanCards({
  current,
  plans,
  pendingKey,
  onCheckout,
  compact,
}: {
  current: BillingCurrent;
  plans: Plan[];
  pendingKey: ProductKey | "portal" | null;
  onCheckout: (productKey: ProductKey) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid gap-3", compact ? "md:grid-cols-2" : "lg:grid-cols-3 xl:grid-cols-1")}>
      {plans
        .filter((plan) => (compact ? plan.key !== "free" : true))
        .map((plan) => (
          <article
            key={plan.key}
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
              {formatIdr(plan.monthlyPriceIdr)}
              <span className="text-sm font-medium text-muted-foreground">/bulan</span>
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
                plan.products
                  .filter((product) => product.configured)
                  .map((product) => (
                    <Button
                      key={product.key}
                      type="button"
                      variant={product.interval === "month" ? "default" : "outline"}
                      onClick={() => onCheckout(product.key as ProductKey)}
                      disabled={pendingKey === product.key}
                      className="rounded-[10px]"
                    >
                      {pendingKey === product.key ? <Loader2Icon className="size-4 animate-spin" /> : null}
                      {product.interval === "month" ? "Bulanan" : "Tahunan"} · {formatIdr(product.displayPriceIdr)}
                    </Button>
                  ))
              )}
            </div>
          </article>
        ))}
    </div>
  );
}
