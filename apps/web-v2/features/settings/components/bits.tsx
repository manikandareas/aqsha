"use client";

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

/** Meter saldo kredit bulanan (used vs limit). Unlimited → tanpa bar + label ∞. */
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
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-heading text-[2rem] font-bold leading-none tabular-nums text-foreground">
          {formatCredits(creditsRemaining, unlimited)}
        </span>
        <span className="text-[12px] text-muted-foreground">
          {unlimited ? "kredit tak terbatas" : `tersisa dari ${formatCredits(creditsLimit, false)}`}
        </span>
      </div>
      {!unlimited ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      <p className="text-[12px] text-muted-foreground">
        {unlimited
          ? "Penggunaan tetap tercatat."
          : `${formatCredits(creditsUsed, false)} terpakai · reset ${formatResetDate(resetAt)}`}
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
    <div className="space-y-3">
      <div className="flex h-28 items-end gap-px border-b border-border/50">
        {days.map((d) => (
          <div
            key={d.date}
            className="flex-1 rounded-t-[2px] bg-primary/25 transition-colors duration-150 hover:bg-primary"
            style={{ height: `${Math.max(2, Math.round((d.credits / max) * 100))}%` }}
            title={`${d.date}: ${d.credits} kredit`}
          />
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground">
        {total === 0
          ? "Belum ada penggunaan pada rentang ini."
          : `${IDR.format(total)} kredit dalam ${days.length} hari`}
      </p>
    </div>
  );
}
