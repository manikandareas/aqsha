"use client";

import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSettingsOverviewData } from "../api/use-settings-overview-data";
import { LoadingSettingsPage } from "../components/loading-settings-page";
import {
  CreditsUsageSection,
  PlanChip,
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelHeader,
  SettingsSummaryCard,
} from "../components/settings-card";
import { SettingsHeader } from "../components/settings-header";
import { UsageHeatmap } from "../components/usage-heatmap";
import { formatShortDate } from "../lib/settings-format";
import { formatProviderSpend, getSetupCompletion, usagePercentage } from "../utils/settings-summary";

export function SettingsOverviewPage() {
  const data = useSettingsOverviewData();
  if (!data.current || !data.activity || data.threadCount === undefined) {
    return <LoadingSettingsPage />;
  }

  const usagePercent = usagePercentage(data.current);
  const setup = getSetupCompletion({
    threadCount: data.threadCount,
    planKey: data.current.planKey,
  });

  return (
    <>
      <SettingsHeader section="overview" title="Pengaturan" />

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsSummaryCard
          label="Paket saat ini"
          footer={
            <Button asChild variant="outline" size="sm" className="h-9 w-fit rounded-lg text-[13px]">
              <Link href="/app/settings/usage-billing">Kelola paket</Link>
            </Button>
          }
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {data.current.planLabel}
              </h3>
              <PlanChip label={data.current.planLabel} status={data.current.status} />
            </div>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Reset {formatShortDate(data.current.resetAt)}
            </p>
          </div>
        </SettingsSummaryCard>

        <SettingsSummaryCard
          label="Mulai riset"
          footer={
            <Button asChild size="sm" className="h-9 w-fit rounded-lg text-[13px]">
              <Link href="/app">Mulai riset</Link>
            </Button>
          }
        >
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              {setup.completedCount}/{setup.totalCount} selesai
            </h3>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Thread dan kredit menentukan kesiapan riset di Aqsha.
            </p>
          </div>
        </SettingsSummaryCard>
      </div>

      <SettingsPanel>
        <SettingsPanelHeader title="Persiapan" description="Langkah singkat sebelum riset penuh." />
        <SettingsPanelBody className="grid gap-0 divide-y divide-border/50">
          <SetupRow
            done={setup.hasThreads}
            title="Thread riset"
            text={`${data.threadCount} thread tersimpan`}
            href="/app"
          />
          <SetupRow
            done={setup.hasPaidPlan}
            title="Kesiapan tagihan"
            text={`Paket sekarang ${data.current.planLabel}`}
            href="/app/settings/usage-billing"
          />
        </SettingsPanelBody>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader title="Penggunaan termasuk" />
        <SettingsPanelBody>
          <CreditsUsageSection
            isUnlimitedCredits={data.current.isUnlimitedCredits}
            usagePercent={usagePercent}
            creditsUsed={data.current.creditsUsed}
            creditsRemaining={data.current.creditsRemaining}
            creditsLimit={data.current.creditsLimit}
          />
        </SettingsPanelBody>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader title="Permukaan riset" />
        <SettingsPanelBody className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[13px] font-medium text-foreground">Thread</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Percakapan dan run riset tersimpan.
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">{data.threadCount} aktif</p>
          </div>
          <div>
            <p className="text-[13px] font-medium text-foreground">Batas provider</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Estimasi biaya terhadap plafon bulanan.
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {formatProviderSpend(data.current)}
            </p>
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

function SetupRow({
  done,
  title,
  text,
  href,
}: {
  done: boolean;
  title: string;
  text: string;
  href: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
            done
              ? "border-mint-soft-border bg-mint-soft text-mint-foreground"
              : "border-border bg-muted/60 text-muted-foreground/50",
          )}
        >
          {done ? <CheckIcon className="size-3.5 stroke-[2.5]" /> : null}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{text}</p>
        </div>
      </div>
      <Button asChild variant="outline" size="sm" className="h-8 shrink-0 rounded-lg text-[12px]">
        <Link href={href}>{done ? "Buka" : "Mulai"}</Link>
      </Button>
    </div>
  );
}
