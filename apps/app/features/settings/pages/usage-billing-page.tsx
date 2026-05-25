"use client";

import { GiftIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsUsageBillingData } from "../api/use-settings-usage-billing-data";
import { BillingErrorBanner } from "../components/billing-error-banner";
import { LoadingSettingsPage } from "../components/loading-settings-page";
import { CreditsUsageSection, SettingRow, SettingsCard, SettingsSectionLabel, SettingsSummaryCard } from "../components/settings-card";
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

      <div className="grid gap-5 md:grid-cols-2">
        <SettingsSummaryCard label="Current plan">
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-bold tracking-tight text-foreground">{data.current.planLabel}</h2>
              <span className="text-[13px] font-medium text-muted-foreground bg-muted/55 px-2 py-0.5 rounded-[4px] border border-border/40">
                {formatPlanPrice(data.plans, data.current.planKey)}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] font-medium text-muted-foreground">
              Resets on {formatShortDate(data.current.resetAt)}
            </p>
          </div>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={data.openPortal}
              disabled={!data.current.billingPortalAvailable || data.pendingKey === "portal"}
              className="mt-4 rounded-[8px] active:scale-[0.97] transition-[background-color,color,box-shadow,transform] duration-150 ease-out"
            >
              {data.pendingKey === "portal" ? <Loader2Icon className="size-3.5 animate-spin mr-1.5" /> : null}
              {data.current.isAdmin ? "Manage existing subscription" : "Adjust plan"}
            </Button>
          </div>
        </SettingsSummaryCard>

        <SettingsSummaryCard label={data.current.isAdmin ? "Internal access" : "Upgrade available"}>
          {nextPlan ? (
            <>
              <div>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-lg font-bold tracking-tight text-foreground">{nextPlan.label}</h2>
                  <span className="text-[13px] font-medium text-muted-foreground bg-muted/55 px-2 py-0.5 rounded-[4px] border border-border/40">
                    {formatIdr(nextPlan.monthlyPriceIdr)}/bulan
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] font-medium text-muted-foreground">
                  {nextPlan.monthlyCredits.toLocaleString("id-ID")} credits/bulan dan provider guard lebih longgar.
                </p>
              </div>
              <div>
                <UpgradeButton plan={nextPlan} pendingKey={data.pendingKey} onCheckout={data.openCheckout} />
              </div>
            </>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-foreground">
                  {data.current.isAdmin ? "Unlimited credits" : "Plan tertinggi"}
                </h2>
                <p className="mt-1.5 text-[13px] font-medium text-muted-foreground">
                  {data.current.isAdmin
                    ? "Billing gate dilewati untuk iterasi developer. Usage tetap tercatat."
                    : "Tidak ada upgrade aktif untuk akun ini."}
                </p>
              </div>
              <div className="h-9" />
            </>
          )}
        </SettingsSummaryCard>
      </div>

      <div className="grid gap-3">
        <SettingsSectionLabel>Included in {data.current.planLabel}</SettingsSectionLabel>
        <SettingsCard className="px-5 py-5">
          <CreditsUsageSection
            isUnlimitedCredits={data.current.isUnlimitedCredits}
            usagePercent={usagePercent}
            creditsUsed={data.current.creditsUsed}
            creditsRemaining={data.current.creditsRemaining}
            creditsLimit={data.current.creditsLimit}
            unlimitedLabel="Tracked usage"
            billingLimitedLabel="Total"
          />
        </SettingsCard>
      </div>

      <div className="grid gap-3">
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
            <span className="rounded-[6px] border border-border/50 bg-muted/65 px-2.5 py-1 font-mono text-xs font-semibold text-muted-foreground inline-block">
              Disabled
            </span>
          </SettingRow>
        </SettingsCard>
      </div>

      <div className="grid gap-3">
        <SettingsSectionLabel>Activity</SettingsSectionLabel>
        <SettingsCard className="px-5 py-5">
          <UsageHeatmap rows={data.activity} />
        </SettingsCard>
      </div>
    </>
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
      className="mt-4 rounded-[8px] active:scale-[0.97] transition-[background-color,color,box-shadow,transform] duration-150 ease-out"
    >
      {pendingKey === monthly.key ? <Loader2Icon className="size-3.5 animate-spin mr-1.5" /> : <GiftIcon className="size-3.5 mr-1.5" />}
      Upgrade
    </Button>
  );
}
