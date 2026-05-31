"use client";

import { Loader2Icon, XCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSettingsUsageBillingData } from "../api/use-settings-usage-billing-data";
import {
  PlanBillingRow,
  PlanIntervalSelector,
  type BillingInterval,
} from "../components/billing-plan-controls";
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
import { formatShortDate } from "../lib/settings-format";
import { formatPlanPrice, formatProviderSpend, usagePercentage } from "../utils/settings-summary";

export function SettingsUsageBillingPage({
  checkoutStatus,
}: {
  checkoutStatus?: string;
}) {
  const data = useSettingsUsageBillingData();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("month");
  const current = data.current;
  const plans = data.plans;
  const activity = data.activity;
  const checkoutNotice =
    checkoutStatus === "success"
      ? "Checkout berhasil dikembalikan. Status langganan diperbarui setelah webhook Polar diterima."
      : null;
  const checkoutError =
    checkoutStatus === "error" ? "Checkout dibatalkan atau gagal diproses." : null;
  const billingNoticeMessage = data.billingNotice ?? checkoutNotice;
  const billingErrorMessage = data.billingError ?? checkoutError;

  useEffect(() => {
    if (billingNoticeMessage) toast.success(billingNoticeMessage);
  }, [billingNoticeMessage]);

  useEffect(() => {
    if (billingErrorMessage) toast.error(billingErrorMessage);
  }, [billingErrorMessage]);

  if (!current || !plans || !activity) return <LoadingSettingsPage />;

  const usagePercent = usagePercentage(current);

  return (
    <>
      <SettingsHeader section="usage-billing" title="Penggunaan & tagihan" />

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsSummaryCard label="Paket saat ini">
          <div>
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {current.planLabel}
              </h3>
              <span className="rounded-md border border-border/50 bg-muted/50 px-2 py-0.5 text-[12px] text-muted-foreground">
                {formatPlanPrice(plans, current.planKey)}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Reset {formatShortDate(current.resetAt)}
            </p>
            {current.currentPeriodEnd ? (
              <p className="mt-1 text-[12px] text-muted-foreground">
                Periode berakhir {formatShortDate(current.currentPeriodEnd)}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={data.openPortal}
            disabled={!current.billingPortalAvailable || data.pendingKey === "portal"}
            className="h-9 w-fit rounded-lg text-[13px]"
          >
            {data.pendingKey === "portal" ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : null}
            {current.isAdmin ? "Kelola langganan" : "Sesuaikan paket"}
          </Button>
        </SettingsSummaryCard>

        <SettingsSummaryCard label="Status langganan">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              {current.cancelAtPeriodEnd
                ? "Berhenti di akhir periode"
                : current.status}
            </h3>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {current.isAdmin
                ? "Admin internal tidak muncul sebagai produk publik."
                : current.billingInterval
                  ? `Billing ${current.billingInterval === "year" ? "tahunan" : "bulanan"}`
                  : "Belum ada langganan aktif."}
            </p>
          </div>
          {current.canCancelSubscription ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={data.cancelPlan}
              disabled={data.pendingKey === "cancel"}
              className="h-9 w-fit rounded-lg text-[13px]"
            >
              {data.pendingKey === "cancel" ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <XCircleIcon className="size-3.5" />
              )}
              Batalkan perpanjangan
            </Button>
          ) : null}
        </SettingsSummaryCard>
      </div>

      <SettingsPanel>
        <SettingsPanelHeader
          title="Paket publik"
          description="Free, Starter, dan Plus adalah produk publik. Admin tetap override internal."
        />
        <SettingsPanelBody className="grid gap-4">
          <PlanIntervalSelector value={billingInterval} onChange={setBillingInterval} />
          <div className="grid gap-3">
            {plans.map((plan) => (
              <PlanBillingRow
                key={plan.key}
                plan={plan}
                interval={billingInterval}
                current={current}
                pendingKey={data.pendingKey}
                onCheckout={data.openCheckout}
                onChangePlan={data.changePlan}
              />
            ))}
          </div>
        </SettingsPanelBody>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader title={`Termasuk di ${current.planLabel}`} />
        <SettingsPanelBody>
          <CreditsUsageSection
            isUnlimitedCredits={current.isUnlimitedCredits}
            usagePercent={usagePercent}
            creditsUsed={current.creditsUsed}
            creditsRemaining={current.creditsRemaining}
            creditsLimit={current.creditsLimit}
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
              {formatProviderSpend(current)}
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
        <SettingsPanelBody className="grid gap-4">
          <div className="flex flex-wrap gap-1 rounded-xl border border-border/60 bg-muted/50 p-1 sm:w-fit">
            {([30, 90, 365] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => data.setUsageRangeDays(days)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${
                  data.usageRangeDays === days
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {days} hari
              </button>
            ))}
          </div>
          <UsageHeatmap rows={activity} />
        </SettingsPanelBody>
      </SettingsPanel>
    </>
  );
}
