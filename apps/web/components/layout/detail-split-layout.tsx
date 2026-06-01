"use client";

import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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
  return (
    <SidebarProvider
      open={sideOpen}
      onOpenChange={onSideOpenChange}
      className={cn(
        "flex min-h-0 min-h-svh flex-1 flex-col overflow-hidden bg-background transition-all duration-300 ease-out",
        sideOpen ? "p-3" : "p-0",
      )}
    >
      <div
        className={cn(
          "grid min-h-0 w-full flex-1 transition-all duration-300 ease-out",
          sideOpen ? "grid-cols-1 md:grid-cols-2 gap-3" : "grid-cols-1 gap-0",
        )}
      >
        <SidebarInset className={detailSplitMainSurfaceClass(sideOpen)}>
          {main}
        </SidebarInset>
        {side}
      </div>
    </SidebarProvider>
  );
}
