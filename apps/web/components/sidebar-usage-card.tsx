"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useBillingCurrent } from "@/features/settings/api";
import { deepRunsQuota, isCreditsLow } from "@/features/settings/lib/billing-derived";
import { cn } from "@/lib/utils";

const BILLING_HREF = "/app/settings/usage-billing";
const NUM = new Intl.NumberFormat("id-ID");
const DAY_MS = 86_400_000;

function resetLabel(resetAt: number): string {
  const days = Math.max(0, Math.ceil((resetAt - Date.now()) / DAY_MS));
  if (days <= 0) return "reset hari ini";
  if (days === 1) return "reset besok";
  return `reset ${days} hari lagi`;
}

/** Shell + hero image bersama (dipakai kartu & skeleton) — layout ala ProCard lama. */
function CardShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-sidebar-border/70 bg-card">
      {/* Hero image = elemen tertinggi. Di mobile sidebar jadi sheet full-height,
          jadi sembunyikan agar footer pendek & tak mendorong daftar thread. */}
      <div className="relative hidden aspect-[16/9] w-full overflow-hidden bg-white md:block">
        <Image src="/pro-card.png" alt="" fill sizes="240px" className="object-cover" />
      </div>
      <div className="grid gap-2.5 p-2.5 md:p-3">{children}</div>
    </div>
  );
}

/**
 * Kartu footer sidebar: usage-vs-plan glanceable, layout & gambar mirip ProCard lama.
 * Satu komponen meng-handle Free (usage + ajakan upgrade), plan berbayar (meter +
 * kelola), dan unlimited (Ultra/Admin → ∞ tanpa bar). Baca `useBillingCurrent`
 * (cache app-wide; sama dgn AgentSelector & slash palette → tak ada fetch ekstra).
 */
export function SidebarUsageCard() {
  const billing = useBillingCurrent();

  if (!billing.data) {
    // Skeleton hanya selagi memuat awal; bila query gagal (data absen tapi tak loading)
    // sembunyikan kartu — jangan tampilkan skeleton yang berputar selamanya.
    if (!billing.isLoading) return null;
    return (
      <CardShell>
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-1.5 w-full animate-pulse rounded-full bg-muted" />
        <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
      </CardShell>
    );
  }

  const {
    planLabel,
    planKey,
    creditsUsed,
    creditsLimit,
    creditsRemaining,
    resetAt,
    isUnlimitedCredits,
    deepRunsLimit,
  } = billing.data;

  const isFree = planKey === "free";
  const pct =
    isUnlimitedCredits || creditsLimit <= 0
      ? 0
      : Math.min(100, Math.round((creditsUsed / creditsLimit) * 100));
  const low = isCreditsLow(billing.data);
  const deep = deepRunsQuota(billing.data);

  return (
    <CardShell>
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading text-[13px] font-semibold leading-none text-card-foreground">
          {planLabel}
        </span>
        {!isUnlimitedCredits ? (
          <span className="text-[11px] text-muted-foreground">{resetLabel(resetAt)}</span>
        ) : null}
      </div>

      {isUnlimitedCredits ? (
        <p className="text-[12px] text-muted-foreground">Kredit tak terbatas ∞</p>
      ) : (
        <div className="grid gap-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500 ease-out",
                low ? "bg-amber-500" : "bg-primary",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p
            className={cn(
              "text-[12px]",
              low ? "font-medium text-amber-600 dark:text-amber-500" : "text-muted-foreground",
            )}
          >
            {NUM.format(creditsRemaining)} dari {NUM.format(creditsLimit)} kredit
          </p>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Riset mendalam:{" "}
        {deep.unlimited
          ? "tanpa batas"
          : `${NUM.format(deep.remaining)} dari ${NUM.format(deepRunsLimit)} tersisa`}
      </p>

      {isFree ? (
        <Button asChild size="sm" className="h-7 text-[12px]">
          <Link href={BILLING_HREF}>Upgrade</Link>
        </Button>
      ) : (
        <Link
          href={BILLING_HREF}
          className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          Kelola langganan →
        </Link>
      )}
    </CardShell>
  );
}
