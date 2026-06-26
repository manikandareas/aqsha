import { cn } from "@/lib/utils";

/**
 * Shared container padding for detail split surfaces (thread, workspace, side panels).
 *
 * Outer gutter when a side panel is open comes from DetailSplitLayout (`p-3`);
 * when closed, main is full-bleed (`p-0`). Inner header/body tokens stay the same.
 */
const panelSurfaceFramedClass =
  "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-background shadow-none";

const panelSurfaceFullBleedClass =
  "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-none border-0 bg-background shadow-none";

export function panelSurfaceClass({ framed = true }: { framed?: boolean } = {}) {
  return framed ? panelSurfaceFramedClass : panelSurfaceFullBleedClass;
}

/** Toolbar / page header row inside a panel or detail main. */
export const panelHeaderPaddingClass = "px-5 py-5 sm:px-6 sm:py-6";

/**
 * Compact glass header bar — sticky, translucent + backdrop-blur, no border.
 * Shared by single-row page headers (explore, thread). The blur only reveals
 * scrolling content where this bar is sticky *inside* the scroll container
 * (explore); elsewhere it reads as a clean borderless compact bar.
 */
export const panelHeaderBarClass =
  "sticky top-0 z-20 flex h-11 shrink-0 items-center justify-between gap-3 bg-background/70 px-5 backdrop-blur-xl sm:px-6";

/** Scrollable library or transcript body below a panel header. */
export const panelBodyPaddingClass = "px-5 pb-8 pt-3 sm:px-6";

/** Composer dock in embedded (compact) chat panels — horizontal matches panelBodyPaddingClass. */
export const panelComposerPaddingClass = "px-5 pb-4 pt-2.5 sm:px-6";

/** Shared transcript column width + horizontal inset for message list and composer. */
export const threadTranscriptColumnClass =
  "mx-auto w-full min-w-0 max-w-2xl px-5 sm:px-6";
export const threadTranscriptBodyPaddingClass = "pb-8 pt-3";
export const threadTranscriptComposerPaddingClass = "pb-4 pt-2.5";

export function detailSplitMainSurfaceClass(framed: boolean) {
  return cn(
    "flex min-h-0 min-w-0 flex-col overflow-hidden bg-background transition-all duration-300 ease-out",
    panelSurfaceClass({ framed }),
  );
}
