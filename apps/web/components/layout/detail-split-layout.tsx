"use client";

import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { usePanelInline } from "@/hooks/use-mobile";
import { detailSplitMainSurfaceClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";

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

  return (
    <SidebarProvider
      open={sideOpen}
      onOpenChange={onSideOpenChange}
      className="flex min-h-0 min-h-svh flex-1 flex-col overflow-hidden bg-background"
    >
      <div
        className={cn(
          "grid min-h-0 w-full flex-1 transition-[grid-template-columns] duration-300 ease-out",
          // Panel = side-panel width that scales with the viewport but is capped (main flexes
          // to fill the rest), not a 50/50 split. Floor keeps main usable at the ~1100px inline edge.
          inset ? "grid-cols-[minmax(0,1fr)_clamp(26rem,32vw,32rem)]" : "grid-cols-1",
        )}
      >
        <SidebarInset className={detailSplitMainSurfaceClass}>
          {main}
        </SidebarInset>
        {side}
      </div>
    </SidebarProvider>
  );
}
