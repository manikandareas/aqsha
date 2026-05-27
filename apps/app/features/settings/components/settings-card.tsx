import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const panelClass =
  "overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03)]";

export function SettingsPanel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <section className={cn(panelClass, className)}>{children}</section>;
}

export function SettingsPanelHeader({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <header className={cn("border-b border-border/60 px-5 py-4 sm:px-6", className)}>
      <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
      {description ? (
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
    </header>
  );
}

export function SettingsPanelBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("px-5 py-5 sm:px-6", className)}>{children}</div>;
}

export function SettingsPanelFooter({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <footer
      className={cn(
        "flex flex-wrap items-center gap-2 border-t border-border/60 bg-muted/20 px-5 py-4 sm:px-6",
        className,
      )}
    >
      {children}
    </footer>
  );
}

export function SettingsField({
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
    <div className={cn("grid gap-2", className)}>
      <div>
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function SettingsReadonlyValue({ value }: { value: string }) {
  return (
    <Input
      disabled
      readOnly
      value={value}
      className="h-[42px] cursor-default rounded-lg border-input bg-muted/40 px-3.5 text-[13px] shadow-none disabled:opacity-100"
    />
  );
}

export function SettingsListItem({
  icon: Icon,
  title,
  subtitle,
  meta,
  trailing,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-border/50 py-4 last:border-b-0 first:pt-0 last:pb-0",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-muted-foreground">
            <Icon className="size-3.5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">{title}</p>
          {subtitle ? (
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{subtitle}</p>
          ) : null}
          {meta ? <div className="mt-2">{meta}</div> : null}
        </div>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

export function SettingsEmptyState({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-muted-foreground">{children}</p>;
}

/** @deprecated Use SettingsPanel */
export function SettingsCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <SettingsPanel className={className}>{children}</SettingsPanel>;
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
    <SettingsListItem
      title={label}
      subtitle={description}
      trailing={children}
      className={className}
    />
  );
}

export function SettingsSummaryCard({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <SettingsPanel>
      <SettingsPanelHeader title={label} />
      <SettingsPanelBody className="flex min-h-[120px] flex-col justify-between gap-4">
        {children}
      </SettingsPanelBody>
    </SettingsPanel>
  );
}

export function CreditsUsageSection({
  isUnlimitedCredits,
  usagePercent,
  creditsUsed,
  creditsRemaining,
  creditsLimit,
  unlimitedLabel = "Kredit tercatat",
  limitedLabel = "Total kredit dipakai",
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
        <div className="flex items-center justify-between gap-4 text-sm font-medium">
          <span className="text-foreground">{unlimitedLabel}</span>
          <span className="rounded-md border border-border/60 bg-muted/60 px-2 py-1 font-mono text-[11px] text-muted-foreground">
            Tanpa batas
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 text-sm font-medium">
            <span className="text-foreground">{billingLimitedLabel ?? limitedLabel}</span>
            <span className="font-mono text-sm font-semibold text-primary">{usagePercent}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/70">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </>
      )}
      <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
        {isUnlimitedCredits
          ? `${creditsUsed} kredit tercatat periode ini. Tidak ada kuota bulanan.`
          : `${creditsUsed} dipakai dan ${creditsRemaining} tersisa dari ${creditsLimit} kredit.`}
      </p>
    </>
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
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        toneClass,
      )}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}

export function PlanChip({ label, status }: { label: string; status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      {label} · {status}
    </span>
  );
}

export function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <SettingsField label={label}>
      <SettingsReadonlyValue value={value} />
    </SettingsField>
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
    <div className={cn("rounded-xl border px-4 py-3.5", toneClass)}>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
