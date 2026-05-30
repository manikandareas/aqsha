import type { ReactNode } from "react";
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

export function PlanChip({ label, status }: { label: string; status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      {label} · {status}
    </span>
  );
}
