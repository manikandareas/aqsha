"use client";

import { PanelLeftIcon } from "@aqsha/ui/icons";
import type { ReactNode } from "react";
import { PanelCardToolbar } from "@/components/layout/side-panel-frame";
import { PanelTitleLabel } from "@/components/panel-title-dropdown-trigger";
import { Button } from "@/components/ui/button";
import { panelBodyPaddingClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";

/** Close affordance shared by the side-panel headers — mirrors the artifact panel toggle. */
export function PanelCloseButton({ onClose }: { onClose?: () => void }) {
  if (!onClose) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      data-panel-close
      className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={onClose}
      aria-label="Tutup panel"
    >
      <PanelLeftIcon className="size-3.5 rotate-180" />
    </Button>
  );
}

/**
 * Pure-content shell for a thread detail side panel (source / search / plan / step) —
 * IN-CARD content only. The flush header (tab strip + close) is owned by the thread
 * shell's single `SidePanelFrame`; this shell contributes the card toolbar (eyebrow +
 * title + actions) and the scrollable body below it.
 */
export function DetailPanelShell({
  title,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  eyebrow?: string;
  /** Aksi panel di kanan toolbar kartu (mis. ekspor referensi di panel Sumber). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <PanelCardToolbar
        title={<PanelTitleLabel>{title}</PanelTitleLabel>}
        eyebrow={eyebrow}
        actions={actions}
      />
      <div className={cn("min-h-0 flex-1 overflow-y-auto", panelBodyPaddingClass)}>
        {children}
      </div>
    </>
  );
}
