import { cn } from "@/lib/utils";

/**
 * Main column surface — stays full-bleed / edge-to-edge (no card framing, no gutter),
 * so opening the panel never reshapes main into a floating card.
 */
export const detailSplitMainSurfaceClass =
  "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-none bg-background shadow-none";

/**
 * Side-panel column — the plain flex column the inline panel docks into (the grid's
 * second column / `SidebarInset`). No card framing: the flush header bar sits at the
 * top (edge-to-edge, aligned with the main header) and the floating card now wraps only
 * the body below it (`sidePanelCardClass`, via `SidePanelFrame`). `w-auto` keeps the
 * column from inheriting `SidebarInset`'s `w-full` (which spilled 12px past the gutter).
 */
export const sidePanelColumnClass =
  "flex min-h-0 w-auto min-w-0 flex-col overflow-hidden bg-background";

/**
 * Side-panel body card — a gently-rounded, hairline-bordered card (no shadow) that floats
 * over the full-bleed main with a gutter on the sides and bottom (`mx-3 mb-3`; no top margin
 * so it tucks directly under the flush header bar). `flex-1` makes it fill the column down to
 * the viewport edge (not fit-to-content). Wraps the scrollable body only — the header lives
 * OUTSIDE the card. Inline (desktop) only; the narrow-viewport drawer renders the body flush
 * inside its Sheet.
 */
export const sidePanelCardClass =
  "mx-3 mb-3 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-background";

/**
 * Min viewport width to dock the detail panel inline beside main. Below this the panel
 * overlays main as a right drawer instead, so a narrow viewport never crushes both
 * columns (which clips panel content past the viewport edge). Shared by DetailSplitLayout
 * (grid column count) and ResponsiveSidePanel (inline inset vs. drawer) so they agree.
 */
export const PANEL_INLINE_MEDIA_QUERY = "(min-width: 1100px)";

/**
 * Compact glass header bar — sticky, translucent + backdrop-blur, no border.
 * Shared by single-row page headers (explore, thread). The blur only reveals
 * scrolling content where this bar is sticky *inside* the scroll container
 * (explore); elsewhere it reads as a clean borderless compact bar.
 */
export const panelHeaderBarClass =
  "sticky top-0 z-20 flex h-11 shrink-0 items-center justify-between gap-3 bg-background/70 px-5 backdrop-blur-xl sm:px-6";

/**
 * Full-height, full-bleed flex body column — the scrollable panel/board body when there is
 * no floating card: the narrow-viewport drawer surface (`SidePanelFrame` flush branch) and
 * the full-page board column. `min-h-0` + `flex-1` let an inner `overflow-y-auto` region
 * size and scroll correctly.
 */
export const panelBodyColumnClass =
  "flex min-h-0 flex-1 flex-col overflow-hidden bg-background";

/** Scrollable library or transcript body below a panel header. */
export const panelBodyPaddingClass = "px-5 pb-8 pt-3 sm:px-6";

/** Composer dock in embedded (compact) chat panels — horizontal matches panelBodyPaddingClass. */
export const panelComposerPaddingClass = "px-5 pb-4 pt-2.5 sm:px-6";

/** Shared transcript column width + horizontal inset for message list and composer. */
export const threadTranscriptColumnClass =
  "mx-auto w-full min-w-0 max-w-2xl px-5 sm:px-6";
export const threadTranscriptBodyPaddingClass = "pb-8 pt-3";
export const threadTranscriptComposerPaddingClass = "pb-4 pt-2.5";

/** Shell tile bento (Explore) — bingkai tunggal halus, bukan kartu dekoratif tebal. */
export function bentoTileClass(extra?: string) {
  return cn(
    "flex min-h-0 min-w-0 flex-col rounded-2xl border border-border/60 bg-card/30 p-4 sm:p-5",
    extra,
  );
}
