"use client";

import { ArrowLeftIcon, SearchIcon } from "@aqsha/ui/icons";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shell bersama untuk popover di dalam composer (slash command + `@mention`).
 * Port dari V1 (apps/web) TANPA cmdk — keyboard-nav ditangani TokenizedPromptInput
 * sendiri, jadi item cukup `div`/`button` biasa (lebih ringan; nol dep baru).
 */

export function ComposerPopoverShell({ children }: { children: ReactNode }) {
  return <div className="rounded-xl bg-popover p-0">{children}</div>;
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
    <div className="flex items-center justify-between gap-2 border-border/60 border-b px-3 pt-2.5 pb-2">
      <div className="flex min-w-0 items-center gap-1.5 font-semibold text-[12px] text-foreground">
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
          <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 font-semibold text-[10px] text-muted-foreground">
            {count}
          </span>
        ) : null}
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border/70 bg-background px-1 font-medium font-mono text-[9.5px] text-foreground/80 leading-none">
          esc
        </span>
        tutup
      </span>
    </div>
  );
}

export function ComposerPopoverList({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} role="listbox" className="max-h-[19rem] overflow-y-auto px-1.5 py-1.5">
      {children}
    </div>
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
    <div>
      {label != null ? (
        <div className="flex items-center gap-2 px-2 pt-2 pb-1 font-medium text-[11px] text-muted-foreground first:pt-1">
          <span className="truncate">{label}</span>
          {count != null ? (
            <span className="ml-auto text-[10.5px] text-muted-foreground/60 tabular-nums">
              {count}
            </span>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function ComposerPopoverItem({
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
  icon?: ComponentType<{ className?: string }>;
  emoji?: string;
  title: ReactNode;
  titleClassName?: string;
  description?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  pinTrailing?: boolean;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}) {
  const showDescription = description != null;
  return (
    <div
      role="option"
      aria-selected={active}
      aria-disabled={disabled}
      onMouseEnter={onMouseEnter}
      onClick={() => {
        if (!disabled) onSelect();
      }}
      className={cn(
        "group/cmd relative flex cursor-pointer gap-2.5 rounded-lg px-2 py-1.5 text-[13px]",
        showDescription ? "items-start" : "items-center",
        active ? "bg-sky-soft/60" : "hover:bg-muted/60",
        disabled && "cursor-not-allowed opacity-50",
        trailing && pinTrailing && "pr-8",
      )}
    >
      <span
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-md",
          showDescription && "mt-0.5",
          active ? "bg-sky-soft text-sky-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {emoji ? (
          <span className="text-[14px] leading-none">{emoji}</span>
        ) : Icon ? (
          <Icon className="size-3.5" />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate font-medium text-foreground leading-5", titleClassName)}>
          {title}
        </span>
        {showDescription ? (
          <span className="mt-0.5 whitespace-normal text-[11.5px] text-muted-foreground leading-4">
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
    </div>
  );
}

export function ComposerPopoverEmpty({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchIcon className="size-4" />
      </span>
      <p className="font-medium text-[12.5px] text-foreground">{title}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

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
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold text-[10px]",
        tone === "accent" ? "bg-sky-soft text-sky-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {Icon ? <Icon className="size-2.5" /> : null}
      {children}
    </span>
  );
}
