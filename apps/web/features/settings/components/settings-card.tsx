import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const panelClass = "overflow-hidden rounded-xl border border-border/70 bg-card";

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
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4 sm:px-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
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
        "flex flex-wrap items-center gap-2 border-t border-border/60 bg-muted/20 px-5 py-3.5 sm:px-6",
        className,
      )}
    >
      {children}
    </footer>
  );
}

/** Baris label/nilai full-bleed. Susun beberapa di dalam `divide-y divide-border/60`. */
export function SettingsRow({
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
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-4 sm:px-6",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children != null ? <div className="shrink-0 text-[13px]">{children}</div> : null}
    </div>
  );
}

/** Chip status netral berbasis token (mis. status langganan, "Saat ini"). */
export function SettingsPill({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SettingsSegmentedControl({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "inline-flex gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5",
        className,
      )}
    >
      {children}
    </div>
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
