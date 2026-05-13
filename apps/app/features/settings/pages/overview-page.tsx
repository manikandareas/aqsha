"use client";

import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlanChip, SettingRow, SettingsCard, SettingsSectionLabel } from "../components/settings-card";
import { UsageHeatmap } from "../components/usage-heatmap";
import { formatShortDate } from "../lib/settings-format";
import { usagePercentage } from "../lib/settings-summaries";
import { BillingErrorBanner, LoadingSettingsPage, SettingsHeader, useSettingsData } from "./shared";

export function SettingsOverviewPage() {
  const data = useSettingsData();
  if (!data.current || !data.activity || !data.threads) {
    return <LoadingSettingsPage />;
  }

  const usagePercent = usagePercentage(data.current);
  const completedCount = [
    data.threads.length > 0,
    data.sourceSummary.total > 0,
    data.current.planKey !== "free",
  ].filter(Boolean).length;

  return (
    <>
      <SettingsHeader section="overview" title="Settings" />
      <BillingErrorBanner message={data.billingError} />

      <div className="grid gap-4 md:grid-cols-2">
        <OverviewSummaryCard label="Current plan">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">{data.current.planLabel}</h2>
            <PlanChip label={data.current.planLabel} status={data.current.status} />
          </div>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            Resets on {formatShortDate(data.current.resetAt)}
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4 rounded-[8px]">
            <Link href="/settings/usage-billing">Manage plan</Link>
          </Button>
        </OverviewSummaryCard>

        <OverviewSummaryCard label="Getting started">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-semibold text-foreground">{completedCount}/3 complete</h2>
            <span className="text-sm font-medium text-muted-foreground">Research setup</span>
          </div>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            Thread, sources, dan credits menentukan readiness riset Aqsha.
          </p>
          <Button asChild size="sm" className="mt-4 rounded-[8px]">
            <Link href="/">Start research</Link>
          </Button>
        </OverviewSummaryCard>
      </div>

      <div className="grid gap-4">
        <SettingsSectionLabel>Setup</SettingsSectionLabel>
        <SettingsCard>
          <ChecklistRow done={data.threads.length > 0} title="Research thread" text={`${data.threads.length} thread tersimpan`} href="/" />
          <ChecklistRow done={data.sourceSummary.total > 0} title="Source library" text={`${data.sourceSummary.total} sumber, ${data.sourceSummary.ready} ready`} href="/sources" />
          <ChecklistRow done={data.current.planKey !== "free"} title="Billing readiness" text={`Plan sekarang ${data.current.planLabel}`} href="/settings/usage-billing" />
        </SettingsCard>
      </div>

      <div className="grid gap-4">
        <SettingsSectionLabel>Included Usage</SettingsSectionLabel>
        <SettingsCard className="px-4 py-4">
          <div className="flex items-center justify-between gap-4 text-sm font-semibold">
            <span>Total credits</span>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-4">
          <SettingsSectionLabel>Research Surface</SettingsSectionLabel>
          <SettingsCard>
            <SettingRow label="Threads" description="Saved conversations and research runs.">
              <p className="text-left text-sm font-semibold text-muted-foreground sm:text-right">
                {data.threads.length} active
              </p>
            </SettingRow>
            <SettingRow label="Sources" description="Corpus entries available for cited answers.">
              <p className="text-left text-sm font-semibold text-muted-foreground sm:text-right">
                {data.sourceSummary.ready} ready / {data.sourceSummary.total} total
              </p>
            </SettingRow>
            <SettingRow label="Provider guard" description="Estimated cost against monthly ceiling.">
              <p className="text-left text-sm font-semibold text-muted-foreground sm:text-right">
                ${(data.current.estimatedCostCents / 100).toFixed(2)} / ${(data.current.providerSpendCeilingCents / 100).toFixed(2)}
              </p>
            </SettingRow>
          </SettingsCard>
        </div>

        <div className="grid gap-4">
          <SettingsSectionLabel>Activity</SettingsSectionLabel>
          <SettingsCard className="px-4 py-4">
            <UsageHeatmap rows={data.activity} />
          </SettingsCard>
        </div>
      </div>
    </>
  );
}

function OverviewSummaryCard({
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

function ChecklistRow({ done, title, text, href }: { done: boolean; title: string; text: string; href: string }) {
  return (
    <SettingRow label={title} description={text}>
      <div className="flex items-center justify-start gap-3 sm:justify-end">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border",
            done
              ? "border-[var(--mint-soft-border)] bg-[var(--mint-soft)] text-[var(--mint)]"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          {done ? <CheckIcon className="size-3.5" /> : null}
        </span>
        <Button asChild variant="outline" size="sm" className="rounded-[8px]">
          <Link href={href}>{done ? "Open" : "Start"}</Link>
        </Button>
      </div>
    </SettingRow>
  );
}
