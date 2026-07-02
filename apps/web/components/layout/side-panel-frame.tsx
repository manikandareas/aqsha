"use client";

import type { ReactNode } from "react";
import { usePanelInline } from "@/hooks/use-mobile";
import {
  panelBodyColumnClass,
  panelHeaderBarClass,
  sidePanelCardClass,
} from "@/lib/panel-surface";

/**
 * Shared frame for every right side-panel surface. Splits the header OUT of the card:
 * the `header` bar renders flush at the top of the column (edge-to-edge, aligned with
 * the main content header), and the body tucks into the floating card BELOW it —
 * so the panel's actions read as living "outside" the card.
 *
 * The card framing (`sidePanelCardClass`) applies inline (desktop) only; in the
 * narrow-viewport drawer (`ResponsiveSidePanel` → Sheet) the body stays flush, since
 * the Sheet is itself the surface. This mirrors how `ResponsiveSidePanel` /
 * `DetailSplitLayout` gate inline-vs-drawer on the same media query.
 */
export function SidePanelFrame({
  header,
  children,
}: {
  /** Fully-formed header bar (carries its own bar class — e.g. `PanelHeaderBar`). */
  header: ReactNode;
  /** Body content; receives the floating card inline, flush in the drawer. */
  children: ReactNode;
}) {
  const inset = usePanelInline();

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {header}
      <div className={inset ? sidePanelCardClass : panelBodyColumnClass}>
        {children}
      </div>
    </div>
  );
}

/**
 * Compact glass header bar for a side panel — the SAME idiom as the main content header
 * (`panelHeaderBarClass`): a single flush row with a title cluster on the left and an
 * action cluster on the right. Pass `title` already wrapped (e.g. `PanelTitleLabel` or a
 * dropdown switcher) so panels can mix a plain label with a richer control.
 */
export function PanelHeaderBar({
  title,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className={panelHeaderBarClass}>
      <div className="flex min-w-0 items-center gap-2">
        {title}
        {eyebrow ? (
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
            {eyebrow}
          </span>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      ) : null}
    </header>
  );
}
