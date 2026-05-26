"use client";

import { GiftIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsUsageBillingData } from "../api/use-settings-usage-billing-data";
import { BillingErrorBanner } from "../components/billing-error-banner";
import { LoadingSettingsPage } from "../components/loading-settings-page";
import {
  CreditsUsageSection,
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelHeader,
  SettingsSummaryCard,
} from "../components/settings-card";
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
      <SettingsHeader section="usage-billing" title="Penggunaan & tagihan" />
      <BillingErrorBanner message={data.billingError} />

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsSummaryCard label="Paket saat ini">
          <div>
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {data.current.planLabel}
              </h3>
              <span className="rounded-md border border-border/50 bg-muted/50 px-2 py-0.5 text-[12px] text-muted-foreground">
                {formatPlanPrice(data.plans, data.current.planKey)}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Reset {formatShortDate(data.current.resetAt)}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={data.openPortal}
            disabled={!data.current.billingPortalAvailable || data.pendingKey === "portal"}
            className="h-9 w-fit rounded-lg text-[13px]"
          >
            {data.pendingKey === "portal" ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : null}
            {data.current.isAdmin ? "Kelola langganan" : "Sesuaikan paket"}
          </Button>
        </SettingsSummaryCard>

        <SettingsSummaryCard
          label={data.current.isAdmin ? "Akses internal" : "Upgrade tersedia"}
        >
          {nextPlan ? (
            <>
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-base font-semibold tracking-tight text-foreground">
                    {nextPlan.label}
                  </h3>
                  <span className="rounded-md border border-border/50 bg-muted/50 px-2 py-0.5 text-[12px] text-muted-foreground">
                    {formatIdr(nextPlan.monthlyPriceIdr)}/bulan
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  {nextPlan.monthlyCredits.toLocaleString("id-ID")} kredit/bulan dan batas provider
                  lebih longgar.
                </p>
              </div>
              <UpgradeButton
                plan={nextPlan}
                pendingKey={data.pendingKey}
                onCheckout={data.openCheckout}
              />
            </>
          ) : (
            <div>
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {data.current.isAdmin ? "Kredit tanpa batas" : "Paket tertinggi"}
              </h3>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                {data.current.isAdmin
                  ? "Gerbang tagihan dilewati untuk iterasi developer. Penggunaan tetap tercatat."
                  : "Tidak ada upgrade aktif untuk akun ini."}
              </p>
            </div>
          )}
        </SettingsSummaryCard>
      </div>

      <SettingsPanel>
        <SettingsPanelHeader title={`Termasuk di ${data.current.planLabel}`} />
        <SettingsPanelBody>
          <CreditsUsageSection
            isUnlimitedCredits={data.current.isUnlimitedCredits}
            usagePercent={usagePercent}
            creditsUsed={data.current.creditsUsed}
            creditsRemaining={data.current.creditsRemaining}
            creditsLimit={data.current.creditsLimit}
            unlimitedLabel="Penggunaan tercatat"
            billingLimitedLabel="Total"
          />
        </SettingsPanelBody>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader
          title="Batas pengeluaran provider"
          description="Aqsha memblokir panggilan provider baru sebelum batas ini terlampaui."
        />
        <SettingsPanelBody className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[13px] font-medium text-foreground">Estimasi biaya provider</p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {formatProviderSpend(data.current)}
            </p>
          </div>
          <div>
            <p className="text-[13px] font-medium text-foreground">Pengeluaran on-demand</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Penggunaan di luar paket bulanan dinonaktifkan di v1.
            </p>
            <span className="mt-2 inline-block rounded-md border border-border/50 bg-muted/60 px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
              Nonaktif
            </span>
          </div>
        </SettingsPanelBody>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader title="Aktivitas" />
        <SettingsPanelBody>
          <UsageHeatmap rows={data.activity} />
        </SettingsPanelBody>
      </SettingsPanel>
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
  const monthly = plan.products.find(
    (product) => product.interval === "month" && product.configured,
  );
  if (!monthly) return null;

  return (
    <Button
      type="button"
      size="sm"
      onClick={() => onCheckout(monthly.key as ProductKey)}
      disabled={pendingKey === monthly.key}
      className="h-9 rounded-lg text-[13px]"
    >
      {pendingKey === monthly.key ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <GiftIcon className="size-3.5" />
      )}
      Upgrade ke {plan.label}
    </Button>
  );
}
