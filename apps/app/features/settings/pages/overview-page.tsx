"use client";

import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSettingsOverviewData } from "../api/use-settings-overview-data";
import { LoadingSettingsPage } from "../components/loading-settings-page";
import { PlanChip, CreditsUsageSection, SettingRow, SettingsCard, SettingsSectionLabel, SettingsSummaryCard } from "../components/settings-card";
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
      <SettingsHeader section="overview" title="Settings" />

      <div className="grid gap-5 md:grid-cols-2">
        <SettingsSummaryCard label="Current plan">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-foreground">{data.current.planLabel}</h2>
              <PlanChip label={data.current.planLabel} status={data.current.status} />
            </div>
            <p className="mt-1.5 text-[13px] font-medium text-muted-foreground">
              Resets on {formatShortDate(data.current.resetAt)}
            </p>
          </div>
          <div>
            <Button asChild variant="outline" size="sm" className="mt-4 rounded-[8px] active:scale-[0.97] transition-[background-color,color,box-shadow,transform] duration-150 ease-out">
              <Link href="/settings/usage-billing">Manage plan</Link>
            </Button>
          </div>
        </SettingsSummaryCard>

        <SettingsSummaryCard label="Getting started">
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                {setup.completedCount}/{setup.totalCount} complete
              </h2>
              <span className="text-[10px] font-bold tracking-wider text-muted-foreground/80 uppercase">Research setup</span>
            </div>
            <p className="mt-1.5 text-[13px] font-medium text-muted-foreground">
              Thread dan credits menentukan readiness riset Aqsha.
            </p>
          </div>
          <div>
            <Button asChild size="sm" className="mt-4 rounded-[8px] active:scale-[0.97] transition-[background-color,color,box-shadow,transform] duration-150 ease-out">
              <Link href="/">Start research</Link>
            </Button>
          </div>
        </SettingsSummaryCard>
      </div>

      <div className="grid gap-3">
        <SettingsSectionLabel>Setup</SettingsSectionLabel>
        <SettingsCard>
          <ChecklistRow done={setup.hasThreads} title="Research thread" text={`${data.threadCount} thread tersimpan`} href="/" />
          <ChecklistRow done={setup.hasPaidPlan} title="Billing readiness" text={`Plan sekarang ${data.current.planLabel}`} href="/settings/usage-billing" />
        </SettingsCard>
      </div>

      <div className="grid gap-3">
        <SettingsSectionLabel>Included Usage</SettingsSectionLabel>
        <SettingsCard className="px-5 py-5">
          <CreditsUsageSection
            isUnlimitedCredits={data.current.isUnlimitedCredits}
            usagePercent={usagePercent}
            creditsUsed={data.current.creditsUsed}
            creditsRemaining={data.current.creditsRemaining}
            creditsLimit={data.current.creditsLimit}
          />
        </SettingsCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="grid gap-3 h-fit">
          <SettingsSectionLabel>Research Surface</SettingsSectionLabel>
          <SettingsCard>
            <SettingRow label="Threads" description="Saved conversations and research runs.">
              <p className="text-left text-sm font-semibold text-muted-foreground sm:text-right">
                {data.threadCount} active
              </p>
            </SettingRow>
            <SettingRow label="Provider guard" description="Estimated cost against monthly ceiling.">
              <p className="text-left text-sm font-semibold text-muted-foreground sm:text-right">
                {formatProviderSpend(data.current)}
              </p>
            </SettingRow>
          </SettingsCard>
        </div>

        <div className="grid gap-3">
          <SettingsSectionLabel>Activity</SettingsSectionLabel>
          <SettingsCard className="px-5 py-5">
            <UsageHeatmap rows={data.activity} />
          </SettingsCard>
        </div>
      </div>
    </>
  );
}

function ChecklistRow({ done, title, text, href }: { done: boolean; title: string; text: string; href: string }) {
  return (
    <SettingRow label={title} description={text}>
      <div className="flex items-center justify-start gap-4 sm:justify-end">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border transition-all duration-150",
            done
              ? "border-mint-soft-border/60 bg-mint-soft/80 text-mint-foreground shadow-sm"
              : "border-border bg-muted/60 text-muted-foreground/60",
          )}
        >
          {done ? <CheckIcon className="size-3.5 stroke-[2.5]" /> : null}
        </span>
        <Button asChild variant="outline" size="sm" className="rounded-[8px] active:scale-[0.97] transition-[background-color,color,box-shadow,transform] duration-150 ease-out">
          <Link href={href}>{done ? "Open" : "Start"}</Link>
        </Button>
      </div>
    </SettingRow>
  );
}
