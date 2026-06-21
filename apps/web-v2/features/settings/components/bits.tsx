"use client";

import { Progress } from "@aqsha/ui/components/progress";

const IDR = new Intl.NumberFormat("id-ID");

export function formatIdr(value: number): string {
  return value === 0 ? "Gratis" : `Rp${IDR.format(value)}`;
}

export function formatCredits(value: number, unlimited: boolean): string {
  if (unlimited) return "∞";
  return IDR.format(value);
}

export function formatResetDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

/** Meter saldo kredit bulanan (used vs limit). Unlimited → bar penuh + label ∞. */
export function CreditMeter({
  creditsUsed,
  creditsLimit,
  creditsRemaining,
  unlimited,
  resetAt,
}: {
  creditsUsed: number;
  creditsLimit: number;
  creditsRemaining: number;
  unlimited: boolean;
  resetAt: number;
}) {
  const pct = unlimited || creditsLimit <= 0 ? 0 : Math.min(100, Math.round((creditsUsed / creditsLimit) * 100));
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-semibold tabular-nums">
          {formatCredits(creditsRemaining, unlimited)}
        </span>
        <span className="text-sm text-muted-foreground">
          {unlimited ? "kredit tak terbatas" : `dari ${formatCredits(creditsLimit, false)} kredit`}
        </span>
      </div>
      {!unlimited ? <Progress value={pct} /> : null}
      <p className="text-xs text-muted-foreground">
        {unlimited ? "Usage tetap tercatat." : `${formatCredits(creditsUsed, false)} terpakai · reset ${formatResetDate(resetAt)}`}
      </p>
    </div>
  );
}

type UsageDay = { date: string; credits: number; eventCount: number };

/** Bar chart ringkas timeseries usage (kredit per hari, ternormalisasi max). */
export function UsageChart({ days }: { days: UsageDay[] }) {
  const max = Math.max(1, ...days.map((d) => d.credits));
  const total = days.reduce((sum, d) => sum + d.credits, 0);
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {total === 0 ? "Belum ada penggunaan pada rentang ini." : `${IDR.format(total)} kredit dalam ${days.length} hari`}
      </p>
      <div className="flex h-24 items-end gap-px">
        {days.map((d) => (
          <div
            key={d.date}
            className="flex-1 rounded-t-sm bg-primary/70 transition-colors hover:bg-primary"
            style={{ height: `${Math.max(2, Math.round((d.credits / max) * 100))}%` }}
            title={`${d.date}: ${d.credits} kredit`}
          />
        ))}
      </div>
    </div>
  );
}
