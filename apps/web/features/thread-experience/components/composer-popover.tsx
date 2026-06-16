"use client";

import type { ComponentType, ReactNode } from "react";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ArrowLeftIcon, SearchIcon } from "@aqsha/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Shared shell for every popover that opens inside the composer input
 * (slash commands, @mention context). One frame, one header, one item
 * language so the surfaces stay visually consistent. Single accent =
 * sky (`bg-sky-soft` / `text-sky-foreground`, the brand "primary accent").
 */

export function ComposerPopoverShell({ children }: { children: ReactNode }) {
  return (
    <Command shouldFilter={false} className="rounded-xl bg-popover p-0">
      {children}
    </Command>
  );
}

export function ComposerPopoverHeader({
  icon: Icon = SearchIcon,
  title,
  count,
  onBack,
  backLabel,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  count?: number;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 pt-2.5 pb-2">
      <div className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-foreground">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel ?? "Kembali"}
            className="inline-flex size-5 items-center justify-center rounded-md bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3" />
          </button>
        ) : (
          <span className="inline-flex size-5 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="size-3" />
          </span>
        )}
        <span className="truncate">{title}</span>
        {count != null && count > 0 ? (
          <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
            {count}
          </span>
        ) : null}
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border/70 bg-background px-1 font-mono text-[9.5px] font-medium leading-none text-foreground/80 shadow-[0_1px_0_0_var(--border)]">
          esc
        </span>
        tutup
      </span>
    </div>
  );
}

export function ComposerPopoverList({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <CommandList id={id} className="max-h-[19rem] px-1.5 py-1.5">
      {children}
    </CommandList>
  );
}

export function ComposerPopoverGroup({
  label,
  count,
  children,
}: {
  label?: ReactNode;
  count?: number;
  children: ReactNode;
}) {
  return (
    <CommandGroup className="p-0 [&_[cmdk-group-heading]]:hidden">
      {label != null ? (
        <div className="flex items-center gap-2 px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground first:pt-1">
          <span className="truncate">{label}</span>
          {count != null ? (
            <span className="ml-auto text-[10.5px] tabular-nums text-muted-foreground/60">
              {count}
            </span>
          ) : null}
        </div>
      ) : null}
      {children}
    </CommandGroup>
  );
}

export function ComposerPopoverItem({
  value,
  icon: Icon,
  emoji,
  title,
  titleClassName,
  description,
  meta,
  trailing,
  pinTrailing,
  active,
  disabled,
  onSelect,
  onMouseEnter,
}: {
  value: string;
  /** Mono glyph rendered inside the leading tile. Ignored when `emoji` is set. */
  icon?: ComponentType<{ className?: string }>;
  /** Emoji rendered inside the leading tile instead of an icon. */
  emoji?: string;
  title: ReactNode;
  titleClassName?: string;
  /** Secondary line revealed only when the row is active ("detail on focus"). */
  description?: ReactNode;
  /** Right-aligned secondary node (faint slug, tag, accent badge). */
  meta?: ReactNode;
  /** Always-visible interactive trailing node (e.g. a drill button). */
  trailing?: ReactNode;
  /** Pin `trailing` to the far-right corner, vertically centered, full-bleed. */
  pinTrailing?: boolean;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}) {
  const showDescription = description != null;
  return (
    <CommandItem
      value={value}
      disabled={disabled}
      onSelect={() => {
        if (disabled) {
          return;
        }
        onSelect();
      }}
      onMouseEnter={onMouseEnter}
      className={cn(
        "group/cmd relative flex gap-2.5 rounded-lg px-2 py-1.5 text-[13px]",
        showDescription ? "items-start" : "items-center",
        "data-[selected=true]:bg-transparent",
        active ? "bg-sky-soft/60" : "hover:bg-muted/60",
        disabled && "opacity-50",
        trailing && pinTrailing && "pr-8",
      )}
    >
      <span
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-md",
          showDescription && "mt-0.5",
          active
            ? "bg-sky-soft text-sky-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {emoji ? (
          <span className="text-[14px] leading-none">{emoji}</span>
        ) : Icon ? (
          <Icon className="size-3.5" />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate font-medium leading-5 text-foreground", titleClassName)}>
          {title}
        </span>
        {showDescription ? (
          <span className="mt-0.5 whitespace-normal text-[11.5px] leading-4 text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      {meta ? (
        <span className={cn("flex shrink-0 items-center gap-1.5", showDescription && "mt-0.5")}>
          {meta}
        </span>
      ) : null}
      {trailing ? (
        pinTrailing ? (
          <span className="absolute inset-y-0 right-2 flex items-center">{trailing}</span>
        ) : (
          <span className={cn("shrink-0", showDescription && "mt-0.5")}>{trailing}</span>
        )
      ) : null}
    </CommandItem>
  );
}

export function ComposerPopoverEmpty({
  title,
  hint,
}: {
  title: string;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchIcon className="size-4" />
      </span>
      <p className="text-[12.5px] font-medium text-foreground">{title}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Small accent pill, e.g. the "Deep" marker on the deep-research command. */
export function ComposerPopoverBadge({
  icon: Icon,
  children,
  tone = "accent",
}: {
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
  tone?: "accent" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        tone === "accent"
          ? "bg-sky-soft text-sky-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {Icon ? <Icon className="size-2.5" /> : null}
      {children}
    </span>
  );
}
