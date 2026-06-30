"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A capped preview of expandable step content that opens the full thing in the side
 * detail panel instead of scrolling inline. The preview is non-interactive; hovering
 * reveals a blurred "Klik untuk detail" overlay, and clicking anywhere opens the panel.
 * Replaces the inline `ScrollArea` for plan / search / verify / counter-evidence steps.
 *
 * Uses `role="button"` on a div (not a `<button>`) because the preview may contain
 * anchors (source cards), which are illegal inside a button. The preview uses `inert`
 * (not just `pointer-events-none`): inert removes its descendants from the tab order
 * AND hides them from assistive tech, so a keyboard user can't land focus on (and Enter
 * to navigate) a source `<a>` inside the preview instead of opening the panel.
 * Falls back to a capped, scrollable preview when no opener is provided (compact chat
 * panels, no detail slot) — keeping long tool output bounded there too.
 */
export function ScrollDetailTrigger({
  onOpen,
  label = "Klik untuk detail",
  maxHeightClass = "max-h-[140px]",
  children,
  className,
}: {
  onOpen?: () => void;
  label?: string;
  maxHeightClass?: string;
  children: ReactNode;
  className?: string;
}) {
  const preview = (
    <>
      <div className={cn("overflow-hidden", maxHeightClass)} inert aria-hidden>
        {children}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent" />
    </>
  );

  // No detail slot (compact chat panels) → no panel to expand to, but still cap the
  // height with an inline scroll so long tool output doesn't push the transcript down.
  if (!onOpen) {
    return (
      <div
        className={cn("overflow-y-auto rounded-lg border bg-background", maxHeightClass, className)}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-lg border bg-background transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {preview}
      <span className="absolute inset-0 flex items-center justify-center bg-background/40 text-[11px] font-medium text-foreground opacity-0 backdrop-blur-[2px] transition-opacity duration-150 group-hover:opacity-100">
        {label}
      </span>
    </div>
  );
}
