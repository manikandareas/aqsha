import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingsCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-[14px] border border-border bg-card/95 p-0 shadow-none", className)}>
      {children}
    </section>
  );
}

export function SettingsSectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-[13px] font-semibold text-muted-foreground">{children}</h2>;
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
    <div className={cn("grid gap-3 border-b border-border px-4 py-4 last:border-b-0 sm:grid-cols-[minmax(180px,0.65fr)_1fr] sm:items-center", className)}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {description ? <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      <div className="min-w-0 sm:justify-self-end">{children}</div>
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
    sky: "border-[var(--sky-soft-border)] bg-[var(--sky-soft)] text-primary",
    mint: "border-[var(--mint-soft-border)] bg-[var(--mint-soft)] text-[var(--mint)]",
    lavender:
      "border-[var(--lavender-soft-border)] bg-[var(--lavender-soft)] text-[var(--lavender)]",
    lemon: "border-[var(--lemon-soft-border)] bg-[var(--lemon-soft)] text-[var(--lemon)]",
    coral: "border-[var(--coral-soft-border)] bg-[var(--coral-soft)] text-[var(--coral)]",
  }[tone];

  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[12px] font-semibold", toneClass)}>
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

export function PlanChip({ label, status }: { label: string; status: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--sky-soft-border)] bg-[var(--sky-soft)] px-2.5 py-1 text-[12px] font-semibold text-primary">
      {label} · {status}
    </span>
  );
}

export function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <SettingRow label={label}>
      <p className="break-all text-left font-mono text-[12px] text-muted-foreground sm:text-right">{value}</p>
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
    mint: "text-[var(--mint)]",
    lemon: "text-[var(--lemon)]",
    coral: "text-[var(--coral)]",
    sky: "text-primary",
  }[tone];

  return (
    <div className="rounded-[12px] border border-border bg-muted/45 px-4 py-3">
      <p className="text-[12px] font-semibold text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", toneClass)}>{value}</p>
    </div>
  );
}
