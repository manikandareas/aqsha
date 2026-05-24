"use client";

import { useEffect, type ReactNode } from "react";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { panelSurfaceClass } from "@/lib/panel-surface";
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
  return (
    <SidebarProvider
      open={sideOpen}
      onOpenChange={onSideOpenChange}
      className="flex min-h-0 min-h-svh flex-1 flex-col overflow-hidden bg-background p-3"
    >
      <div
        className={cn(
          "grid min-h-0 w-full flex-1 gap-3",
          sideOpen ? "md:grid-cols-2" : "md:grid-cols-1",
        )}
      >
        <MobileSidePanelOpenSync
          open={sideOpen}
          onOpenChange={onSideOpenChange}
        />
        <SidebarInset className={panelSurfaceClass}>{main}</SidebarInset>
        {side}
      </div>
    </SidebarProvider>
  );
}

function MobileSidePanelOpenSync({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    if (!isMobile || openMobile === open) return;
    setOpenMobile(open);
  }, [isMobile, open, openMobile, setOpenMobile]);

  useEffect(() => {
    if (!isMobile || openMobile || !open) return;
    onOpenChange(false);
  }, [isMobile, onOpenChange, open, openMobile]);

  return null;
}
