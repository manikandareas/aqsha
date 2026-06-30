"use client";

import { PanelLeftIcon } from "@aqsha/ui/icons";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { panelBodyPaddingClass, panelHeaderPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";

/** Close affordance shared by the thread detail panels — mirrors the artifact panel toggle. */
export function PanelCloseButton({ onClose }: { onClose?: () => void }) {
  if (!onClose) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={onClose}
      aria-label="Tutup panel"
    >
      <PanelLeftIcon className="size-3.5 rotate-180" />
    </Button>
  );
}

/**
 * Pure-content shell for a thread detail side panel (source / search / plan). Fills
 * the framed slot from `ResponsiveSidePanel` without re-framing: a borderless title
 * bar with a close toggle over a scrollable body. Mirrors the artifact panel rhythm.
 */
export function DetailPanelShell({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow?: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header
        className={cn(
          "flex shrink-0 items-start justify-between gap-3 bg-background",
          panelHeaderPaddingClass,
        )}
      >
        <div className="grid min-w-0 gap-0.5">
          {eyebrow ? (
            <span className="text-[11px] font-medium text-muted-foreground">{eyebrow}</span>
          ) : null}
          <h2 className="min-w-0 break-words text-[15px] font-semibold leading-snug text-foreground">
            {title}
          </h2>
        </div>
        <PanelCloseButton onClose={onClose} />
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto", panelBodyPaddingClass)}>
        {children}
      </div>
    </div>
  );
}
