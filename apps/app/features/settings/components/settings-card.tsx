import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsSummaryCard({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="min-h-[140px] rounded-xl border border-border/60 bg-card/65 backdrop-blur-[2px] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all duration-150 hover:shadow-sm hover:border-border/80 flex flex-col justify-between">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/80">
        {label}
      </p>
      <div className="mt-3 flex-1 flex flex-col justify-between">{children}</div>
    </section>
  );
}

export function CreditsUsageSection({
  isUnlimitedCredits,
  usagePercent,
  creditsUsed,
  creditsRemaining,
  creditsLimit,
  unlimitedLabel = "Tracked credits",
  limitedLabel = "Total credits used",
  billingLimitedLabel = "Total",
}: {
  isUnlimitedCredits: boolean;
  usagePercent: number;
  creditsUsed: number;
  creditsRemaining: number;
  creditsLimit: number;
  unlimitedLabel?: string;
  limitedLabel?: string;
  billingLimitedLabel?: string;
}) {
  return (
    <>
      {isUnlimitedCredits ? (
        <div className="flex items-center justify-between gap-4 text-sm font-semibold">
          <span className="tracking-tight text-foreground">{unlimitedLabel}</span>
          <span className="font-mono text-xs text-muted-foreground bg-muted/65 border border-border/50 px-2 py-1 rounded-[4px]">
            Unlimited
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 text-sm font-semibold">
            <span className="tracking-tight text-foreground">
              {billingLimitedLabel ?? limitedLabel}
            </span>
            <span className="font-mono text-sm text-primary font-bold">{usagePercent}%</span>
          </div>
          <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-muted/70">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-300"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </>
      )}
      <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
        {isUnlimitedCredits
          ? `${creditsUsed} credits tracked this period. No monthly credit quota applies.`
          : `${creditsUsed} used and ${creditsRemaining} remaining from ${creditsLimit} credits.`}
      </p>
    </>
  );
}

export function SettingsCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-border/60 bg-card/65 backdrop-blur-[2px] p-0 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden", className)}>
      {children}
    </section>
  );
}

export function SettingsSectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-heading text-xs font-semibold tracking-wider uppercase text-muted-foreground/80 pl-1.5">
      {children}
    </h2>
  );
}

export function SettingRow({
  label,
  description,
  children,
  className,
}: {
  label: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 border-b border-border/50 px-5 py-5 last:border-b-0 sm:grid-cols-[minmax(180px,0.65fr)_1fr] sm:items-center", className)}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground tracking-tight">{label}</p>
        {description ? <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      <div className="min-w-0 sm:justify-self-end w-full sm:w-auto">{children}</div>
    </div>
  );
}

export function AccentPill({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: "sky" | "mint" | "lavender" | "lemon" | "coral";
}) {
  const toneClass = {
    sky: "border-sky-soft-border/60 bg-sky-soft/80 text-sky-foreground",
    mint: "border-mint-soft-border/60 bg-mint-soft/80 text-mint-foreground",
    lavender: "border-lavender-soft-border/60 bg-lavender-soft/80 text-lavender-foreground",
    lemon: "border-lemon-soft-border/60 bg-lemon-soft/80 text-lemon-foreground",
    coral: "border-coral-soft-border/60 bg-coral-soft/80 text-coral-foreground",
  }[tone];

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide", toneClass)}>
      <Icon className="size-3" />
      {label}
    </span>
  );
}

export function PlanChip({ label, status }: { label: string; status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-soft-border/60 bg-sky-soft/80 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-sky-foreground">
      {label} · {status}
    </span>
  );
}

export function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <SettingRow label={label}>
      <div className="flex sm:justify-end w-full">
        <code className="font-mono text-xs text-muted-foreground bg-muted/65 border border-border/50 px-2.5 py-1.5 rounded-[6px] max-w-md break-all overflow-hidden inline-block leading-normal text-left sm:text-right">
          {value}
        </code>
      </div>
    </SettingRow>
  );
}

export function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "mint" | "lemon" | "coral" | "sky";
}) {
  const toneClass = {
    mint: "text-mint-foreground bg-mint-soft/30 border-mint-soft-border/50",
    lemon: "text-lemon-foreground bg-lemon-soft/30 border-lemon-soft-border/50",
    coral: "text-coral-foreground bg-coral-soft/30 border-coral-soft-border/50",
    sky: "text-sky-foreground bg-sky-soft/30 border-sky-soft-border/50",
  }[tone];

  return (
    <div className={cn("rounded-xl border px-4.5 py-3.5 shadow-none transition-all duration-150 hover:shadow-sm", toneClass)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
