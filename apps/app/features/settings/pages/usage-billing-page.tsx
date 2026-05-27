"use client";

import { useMemo, useState } from "react";
import { GiftIcon, Loader2Icon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsUsageBillingData, type UsageRangeDays } from "../api/use-settings-usage-billing-data";
import { BillingErrorBanner } from "../components/billing-error-banner";
import { LoadingSettingsPage } from "../components/loading-settings-page";
import { PlanCards } from "../components/plan-cards";
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
import {
  findUpgradePlan,
  formatPlanPrice,
  formatProviderSpend,
  usagePercentage,
} from "../utils/settings-summary";
import type { BillingInterval } from "../lib/types";

export function SettingsUsageBillingPage() {
  const data = useSettingsUsageBillingData();
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval | null>(null);
  const urlNotice = useMemo(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return null;
    return "Checkout berhasil. Status langganan akan tersinkron setelah webhook Polar masuk.";
  }, []);

  if (!data.current || !data.plans || !data.activity) return <LoadingSettingsPage />;

  const current = data.current;
  const selectedBillingInterval = selectedInterval ?? current.billingInterval ?? "month";
  const nextPlan = findUpgradePlan(data.plans, data.current.planKey);
  const usagePercent = usagePercentage(data.current);
  const effectiveNotice = data.billingNotice ?? urlNotice;

  return (
    <>
      <SettingsHeader section="usage-billing" title="Penggunaan & tagihan" />
      {effectiveNotice ? (
        <div className="rounded-[12px] border border-mint-soft-border bg-mint-soft px-4 py-3 text-sm font-medium leading-6 text-mint-foreground">
          {effectiveNotice}
        </div>
      ) : null}
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
              {data.current.billingInterval ? ` · ${intervalLabel(data.current.billingInterval)}` : ""}
              {data.current.cancelAtPeriodEnd ? " · batal akhir periode" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
              Portal
            </Button>
            {!data.current.isAdmin &&
            data.current.planKey !== "free" &&
            !data.current.cancelAtPeriodEnd ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={data.cancelSubscription}
                disabled={data.pendingKey === "cancel"}
                className="h-9 w-fit rounded-lg text-[13px] text-coral-foreground hover:text-coral-foreground"
              >
                {data.pendingKey === "cancel" ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <XCircleIcon className="size-3.5" />
                )}
                Batalkan
              </Button>
            ) : null}
          </div>
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
                interval={selectedBillingInterval}
                pendingKey={data.pendingKey}
                onSelect={data.selectProduct}
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
        <SettingsPanelHeader
          title="Paket"
          description="Pilih interval pembayaran sebelum checkout atau perubahan langganan."
        />
        <SettingsPanelBody className="grid gap-4">
          <PlanCards
            current={current}
            plans={data.plans}
            pendingKey={data.pendingKey}
            onCheckout={data.selectProduct}
            compact
            selectedInterval={selectedBillingInterval}
            onIntervalChange={setSelectedInterval}
            currentProductKey={current.productKey}
            disabled={current.isAdmin}
          />
        </SettingsPanelBody>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader title="Aktivitas" />
        <SettingsPanelBody className="grid gap-4">
          <UsageRangeSelector value={data.usageDays} onChange={data.setUsageDays} />
          <UsageHeatmap rows={data.activity} />
        </SettingsPanelBody>
      </SettingsPanel>
    </>
  );
}

function UpgradeButton({
  plan,
  interval,
  pendingKey,
  onSelect,
}: {
  plan: NonNullable<ReturnType<typeof findUpgradePlan>>;
  interval: BillingInterval;
  pendingKey: Parameters<typeof PlanCards>[0]["pendingKey"];
  onSelect: Parameters<typeof PlanCards>[0]["onCheckout"];
}) {
  const product = plan.products.find(
    (item) => item.interval === interval && item.configured,
  );
  if (!product) return null;

  return (
    <Button
      type="button"
      size="sm"
      onClick={() => onSelect(product.key)}
      disabled={pendingKey === product.key}
      className="h-9 rounded-lg text-[13px]"
    >
      {pendingKey === product.key ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <GiftIcon className="size-3.5" />
      )}
      Upgrade ke {plan.label}
    </Button>
  );
}

function UsageRangeSelector({
  value,
  onChange,
}: {
  value: UsageRangeDays;
  onChange: (value: UsageRangeDays) => void;
}) {
  const ranges: UsageRangeDays[] = [30, 90, 365];
  return (
    <div className="flex flex-wrap gap-1.5">
      {ranges.map((range) => (
        <button
          key={range}
          type="button"
          onClick={() => onChange(range)}
          className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium ${
            value === range
              ? "border-primary/50 bg-primary text-primary-foreground"
              : "border-border/60 bg-muted/40 text-muted-foreground"
          }`}
        >
          {range} hari
        </button>
      ))}
    </div>
  );
}

function intervalLabel(interval: BillingInterval) {
  return interval === "month" ? "Bulanan" : "Tahunan";
}
