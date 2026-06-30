"use client";

import { PanelLeftIcon } from "@aqsha/ui/icons";
import type { ReactNode } from "react";
import { PanelHeaderBar, SidePanelFrame } from "@/components/layout/side-panel-frame";
import { PanelTitleLabel } from "@/components/panel-title-dropdown-trigger";
import { Button } from "@/components/ui/button";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
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
 * Pure-content shell for a thread detail side panel (source / search / plan / step).
 * The flush header bar renders OUTSIDE the floating card (via `SidePanelFrame`), matching
 * the main content header (`panelHeaderBarClass` + `PanelTitleLabel`); the scrollable body
 * tucks into the card below it.
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
    <SidePanelFrame
      header={
        <PanelHeaderBar
          title={<PanelTitleLabel>{title}</PanelTitleLabel>}
          eyebrow={eyebrow}
          actions={<PanelCloseButton onClose={onClose} />}
        />
      }
    >
      <div className={cn("min-h-0 flex-1 overflow-y-auto", panelBodyPaddingClass)}>
        {children}
      </div>
    </SidePanelFrame>
  );
}
