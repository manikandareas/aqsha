"use client";

import { GiftIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsUsageBillingData } from "../api/use-settings-usage-billing-data";
import { BillingErrorBanner } from "../components/billing-error-banner";
import { LoadingSettingsPage } from "../components/loading-settings-page";
import { SettingRow, SettingsCard, SettingsSectionLabel } from "../components/settings-card";
import { SettingsHeader } from "../components/settings-header";
import { UsageHeatmap } from "../components/usage-heatmap";
import { formatIdr, formatShortDate } from "../lib/settings-format";
import { findUpgradePlan, formatPlanPrice, formatProviderSpend, usagePercentage } from "../utils/settings-summary";
import type { Plan, ProductKey } from "../lib/types";

export function SettingsUsageBillingPage() {
  const data = useSettingsUsageBillingData();
  if (!data.current || !data.plans || !data.activity) return <LoadingSettingsPage />;

  const nextPlan = findUpgradePlan(data.plans, data.current.planKey);
  const usagePercent = usagePercentage(data.current);

  return (
    <>
      <SettingsHeader section="usage-billing" title="Billing & Usage" />
      <BillingErrorBanner message={data.billingError} />

      <div className="grid gap-4 md:grid-cols-2">
        <BillingSummaryCard label="Current plan">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-semibold text-foreground">{data.current.planLabel}</h2>
            <span className="text-sm font-medium text-muted-foreground">
              {formatPlanPrice(data.plans, data.current.planKey)}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            Resets on {formatShortDate(data.current.resetAt)}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={data.openPortal}
            disabled={data.current.planKey === "free" || data.pendingKey === "portal"}
            className="mt-4 rounded-[8px]"
          >
            {data.pendingKey === "portal" ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
            Adjust plan
          </Button>
        </BillingSummaryCard>

        <BillingSummaryCard label="Upgrade available">
          {nextPlan ? (
            <>
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-semibold text-foreground">{nextPlan.label}</h2>
                <span className="text-sm font-medium text-muted-foreground">
                  {formatIdr(nextPlan.monthlyPriceIdr)}/bulan
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-muted-foreground">
                {nextPlan.monthlyCredits.toLocaleString("id-ID")} credits/bulan dan provider guard lebih longgar.
              </p>
              <UpgradeButton plan={nextPlan} pendingKey={data.pendingKey} onCheckout={data.openCheckout} />
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-foreground">Plan tertinggi</h2>
              <p className="mt-2 text-sm font-medium text-muted-foreground">
                Tidak ada upgrade aktif untuk akun ini.
              </p>
            </>
          )}
        </BillingSummaryCard>
      </div>

      <div className="grid gap-4">
        <SettingsSectionLabel>Included in {data.current.planLabel}</SettingsSectionLabel>
        <SettingsCard className="px-4 py-4">
          <div className="flex items-center justify-between gap-4 text-sm font-semibold">
            <span>Total</span>
            <span>{usagePercent}%</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${usagePercent}%` }} />
          </div>
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            {data.current.creditsUsed} used and {data.current.creditsRemaining} remaining from {data.current.creditsLimit} credits.
          </p>
        </SettingsCard>
      </div>

      <div className="grid gap-4">
        <SettingsSectionLabel>Provider Spend Guard</SettingsSectionLabel>
        <SettingsCard>
          <SettingRow
            label="Estimated provider spend"
            description="Aqsha blocks new provider calls before this guard is exceeded."
          >
            <p className="text-left text-sm font-semibold text-muted-foreground sm:text-right">
              {formatProviderSpend(data.current)}
            </p>
          </SettingRow>
          <SettingRow label="On-demand spending" description="Extra usage outside the monthly plan is disabled in v1.">
            <span className="rounded-[8px] border border-border bg-muted px-2.5 py-1 text-sm font-semibold text-muted-foreground">
              Disabled
            </span>
          </SettingRow>
        </SettingsCard>
      </div>

      <div className="grid gap-4">
        <SettingsSectionLabel>Activity</SettingsSectionLabel>
        <SettingsCard className="px-4 py-4">
          <UsageHeatmap rows={data.activity} />
        </SettingsCard>
      </div>
    </>
  );
}

function BillingSummaryCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-h-[120px] rounded-[14px] border border-border bg-card/95 px-4 py-4 shadow-none">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function UpgradeButton({
  plan,
  pendingKey,
  onCheckout,
}: {
  plan: Plan;
  pendingKey: ProductKey | "portal" | null;
  onCheckout: (productKey: ProductKey) => void;
}) {
  const monthly = plan.products.find((product) => product.interval === "month" && product.configured);
  if (!monthly) return null;

  return (
    <Button
      type="button"
      size="sm"
      onClick={() => onCheckout(monthly.key as ProductKey)}
      disabled={pendingKey === monthly.key}
      className="mt-4 rounded-[8px]"
    >
      {pendingKey === monthly.key ? <Loader2Icon className="size-3.5 animate-spin" /> : <GiftIcon className="size-3.5" />}
      Upgrade
    </Button>
  );
}
