"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { usePanelInline } from "@/hooks/use-mobile";
import {
  detailSplitMainSurfaceClass,
  PANEL_TRANSITION_MS,
} from "@/lib/panel-surface";
import { cn } from "@/lib/utils";

type PanelExpandValue = {
  /** Expand only applies while the panel docks inline (desktop) — the drawer is already full-width. */
  canExpand: boolean;
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
};

const PanelExpandContext = createContext<PanelExpandValue | null>(null);

/** Panel width control (normal vs expanded 30:70 split). Null outside `DetailSplitLayout`. */
export function usePanelExpand(): PanelExpandValue | null {
  return use(PanelExpandContext);
}

export function DetailSplitLayout({
  main,
  side,
  sideOpen,
  onSideOpenChange,
}: {
  main: ReactNode;
  side: ReactNode;
  sideOpen: boolean;
  onSideOpenChange: (open: boolean) => void;
}) {
  // Dock the panel inline (two columns) only when the viewport is wide enough for both
  // a usable main and a usable panel. Below that, ResponsiveSidePanel overlays main as a
  // drawer, so main keeps its full width and panel content never spills past the viewport.
  const canInset = usePanelInline();
  const inset = sideOpen && canInset;
  // Expanded = a 30:70 split (panel takes 70), toggled from the panel header
  // (`PanelExpandButton`). Sticky across open/close within the page mount.
  const [expanded, setExpanded] = useState(false);

  return (
    <SidebarProvider
      open={sideOpen}
      onOpenChange={onSideOpenChange}
      className="flex min-h-0 min-h-svh flex-1 flex-col overflow-hidden bg-background"
    >
      <PanelExpandContext.Provider
        value={{ canExpand: canInset, expanded, setExpanded }}
      >
        <div
          style={{ transitionDuration: `${PANEL_TRANSITION_MS}ms` }}
          className={cn(
            "grid min-h-0 w-full flex-1 transition-[grid-template-columns] ease-out",
            // ALWAYS two tracks with a length-typed side width (0 when closed) so
            // grid-template-columns interpolates — that's the open/close slide and the
            // expand tween. Panel = capped width that scales with the viewport (main
            // flexes to fill), or a 30:70 split when expanded. Floor keeps main usable
            // at the ~1100px inline edge.
            inset
              ? expanded
                ? "grid-cols-[minmax(0,1fr)_70%]"
                : "grid-cols-[minmax(0,1fr)_clamp(26rem,32vw,32rem)]"
              : "grid-cols-[minmax(0,1fr)_0rem]",
          )}
        >
          <SidebarInset className={detailSplitMainSurfaceClass}>
            {main}
          </SidebarInset>
          {side}
        </div>
      </PanelExpandContext.Provider>
    </SidebarProvider>
  );
}
