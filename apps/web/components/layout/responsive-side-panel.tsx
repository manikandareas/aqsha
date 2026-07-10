"use client";

import { memo, useEffect, useState, type ReactNode } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { usePanelInline } from "@/hooks/use-mobile";
import { PANEL_TRANSITION_MS, sidePanelColumnClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";

/**
 * Keep children mounted through the close transition so the slide-out actually shows
 * content (unmounting on `open=false` would blank the column while its track is still
 * animating shut). Returns true while open OR closing.
 */
function useTransitionPresence(open: boolean, durationMs: number): boolean {
  const [present, setPresent] = useState(open);
  // Opening mounts immediately (adjust-state-during-render, not an effect); only the
  // unmount after closing is deferred, via the timeout below.
  if (open && !present) setPresent(true);
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setPresent(false), durationMs);
    return () => clearTimeout(timer);
  }, [open, durationMs]);
  return present;
}

/**
 * Freeze the panel content while it slides out: the host recomputes `children` to the
 * default panel the instant its mode closes, so rendering live children would swap the
 * closing panel's content mid-animation (and mount its data fetches). The memo
 * comparator claims props are equal while `frozen`, so React keeps the last open
 * render until the transition ends and the subtree unmounts.
 */
const FreezeWhileClosing = memo(
  function FreezeWhileClosing({ children }: { frozen: boolean; children: ReactNode }) {
    return <>{children}</>;
  },
  (_prev, next) => next.frozen,
);

export function ResponsiveSidePanel({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const canInset = usePanelInline();
  const { setOpen } = useSidebar();
  const present = useTransitionPresence(open, PANEL_TRANSITION_MS);
  const content = present ? (
    <FreezeWhileClosing frozen={!open}>{children}</FreezeWhileClosing>
  ) : null;

  // Wide viewport: dock inline beside main as the grid's second column, which is ALWAYS
  // rendered (0-width track when closed) so DetailSplitLayout can tween the open/close
  // slide. Content stays mounted while closing (frozen at its last open state), fades
  // with the slide, and is inert whenever closed so nothing hidden can take focus. The
  // flush header + floating body card come from `SidePanelFrame` inside the panel content.
  if (canInset) {
    return (
      <SidebarInset
        inert={!open}
        aria-hidden={!open}
        className={cn(
          sidePanelColumnClass,
          "transition-opacity ease-out",
          !open && "opacity-0",
        )}
        style={{ transitionDuration: `${PANEL_TRANSITION_MS}ms` }}
      >
        {content}
      </SidebarInset>
    );
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
          {content}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
