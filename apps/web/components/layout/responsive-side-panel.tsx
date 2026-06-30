"use client";

import type { ReactNode } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { usePanelInline } from "@/hooks/use-mobile";
import { sidePanelColumnClass } from "@/lib/panel-surface";

export function ResponsiveSidePanel({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const canInset = usePanelInline();
  const { setOpen } = useSidebar();

  // Wide viewport: dock inline beside main as the grid's second column. A plain column
  // now — the flush header + floating body card come from `SidePanelFrame` inside the
  // panel content, so the header sits OUTSIDE the card.
  if (canInset) {
    if (!open) return null;
    return <SidebarInset className={sidePanelColumnClass}>{children}</SidebarInset>;
  }

  // Narrow viewport (mobile / small screen): overlay main as a bottom drawer (shadcn/vaul)
  // that slides up from the bottom and can be swiped down to dismiss — main keeps its full
  // width and the panel gets a comfortable, tall sheet instead of a crushed half-column.
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => !next && setOpen(false)}
      direction="bottom"
    >
      <DrawerContent aria-describedby={undefined} className="h-[88vh] p-0">
        <DrawerTitle className="sr-only">Panel detail</DrawerTitle>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
