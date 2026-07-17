import { cn } from '@aqsha/ui-svelte/utils';

/**
 * Shared panel/surface class contract. Pure class-name constants (framework-agnostic); the reactive
 * inline breakpoint lives in `$lib/hooks/panel-inline.svelte.ts`. Container-query variants
 * (`@2xl`/`@3xl`/`@5xl`) are preserved verbatim — layout inside these columns adapts to the COLUMN
 * width, not the viewport.
 */

/**
 * Main column surface — stays full-bleed / edge-to-edge (no card framing, no gutter),
 * so opening the panel never reshapes main into a floating card.
 */
export const detailSplitMainSurfaceClass =
	'@container flex min-h-0 min-w-0 flex-col overflow-hidden rounded-none bg-background shadow-none';

/**
 * Side-panel column — the plain flex column the inline panel docks into (the grid's
 * second column / `SidebarInset`). No card framing.
 */
export const sidePanelColumnClass =
	'@container flex min-h-0 w-auto min-w-0 flex-col overflow-hidden bg-background';

/**
 * Side-panel body card — a 2px-bordered surface card (no shadow) that floats
 * over the full-bleed main with a gutter on the sides and bottom.
 */
export const sidePanelCardClass =
	'mx-3 mb-3 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border-2 border-border bg-background';

/**
 * Min viewport width to dock the detail panel inline beside main. Below this the panel
 * overlays main as a right drawer instead.
 */
export const PANEL_INLINE_MEDIA_QUERY = '(min-width: 1100px)';

/**
 * Duration of the panel open/close slide. Single source for `DetailSplitLayout`'s
 * grid-template-columns tween, `ResponsiveSidePanel`'s opacity fade, and the
 * delayed-unmount presence timer.
 */
export const PANEL_TRANSITION_MS = 300;

/** Compact solid header bar — sticky, opaque surface over a 1px hairline (internal divider). */
export const panelHeaderBarClass =
	'sticky top-0 z-20 flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-5 @2xl:px-6';

/** Full-height, full-bleed flex body column — the scrollable panel/board body with no card. */
export const panelBodyColumnClass = 'flex min-h-0 flex-1 flex-col overflow-hidden bg-background';

/** In-card toolbar — the compact top bar INSIDE the floating side-panel card. */
export const panelCardToolbarClass =
	'flex h-11 shrink-0 items-center justify-between gap-2 bg-background px-3.5';

/** Scrollable library or transcript body below a panel header. */
export const panelBodyPaddingClass = 'px-5 pb-8 pt-3 @2xl:px-6';

/** Composer dock in embedded (compact) chat panels — horizontal matches panelBodyPaddingClass. */
export const panelComposerPaddingClass = 'px-5 pb-4 pt-2.5 @2xl:px-6';

/** Shared transcript column width + horizontal inset for message list and composer. */
export const threadTranscriptColumnClass = 'mx-auto w-full min-w-0 max-w-2xl px-5 @2xl:px-6';
export const threadTranscriptBodyPaddingClass = 'pb-8 pt-3';
export const threadTranscriptComposerPaddingClass = 'pb-4 pt-2.5';

/** Shell tile bento (Explore) — bingkai tunggal halus, bukan kartu dekoratif tebal. */
export function bentoTileClass(extra?: string) {
	return cn(
		'flex min-h-0 min-w-0 flex-col rounded-lg border-2 border-border bg-card/30 p-4 sm:p-5',
		extra
	);
}
