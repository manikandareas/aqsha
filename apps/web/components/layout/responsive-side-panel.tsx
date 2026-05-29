"use client";

import type { ReactNode } from "react";
import { Sidebar, SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { panelSurfaceClass } from "@/lib/panel-surface";

export function ResponsiveSidePanel({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const { isMobile } = useSidebar();

  if (!open) {
    return null;
  }

  if (isMobile) {
    return (
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="[&_[data-slot=sidebar-inner]]:bg-background"
      >
        {children}
      </Sidebar>
    );
  }

  return <SidebarInset className={panelSurfaceClass({ framed: true })}>{children}</SidebarInset>;
}
