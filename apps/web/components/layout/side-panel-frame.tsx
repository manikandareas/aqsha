"use client";

import { ExpandIcon, ShrinkIcon } from "@aqsha/ui/icons";
import type { KeyboardEvent, ReactNode } from "react";
import { usePanelExpand } from "@/components/layout/detail-split-layout";
import { PanelTitleLabel } from "@/components/panel-title-dropdown-trigger";
import { Button } from "@/components/ui/button";
import { usePanelInline } from "@/hooks/use-mobile";
import {
  panelBodyColumnClass,
  panelCardToolbarClass,
  panelHeaderBarClass,
  sidePanelCardClass,
} from "@/lib/panel-surface";
import { cn } from "@/lib/utils";

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
      <PanelBarContent title={title} eyebrow={eyebrow} actions={actions} />
    </header>
  );
}

/** Title/eyebrow + actions clusters shared by `PanelHeaderBar` and `PanelCardToolbar`. */
function PanelBarContent({
  title,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <>
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
    </>
  );
}

export type PanelTab = {
  key: string;
  label: string;
  /** Non-navigable tab (upcoming feature) — rendered muted with the `hint` chip. */
  disabled?: boolean;
  /** Small hint after the label (e.g. "segera" on an upcoming tab). */
  hint?: string;
};

/**
 * Flush header bar variant that makes the side panel a HOME for several panels: the tab
 * strip sits in the left cluster, panel-level actions (close toggle) in the right one.
 * With one usable tab or fewer the strip collapses to a plain title label — a single-tab
 * strip reads as noise. Same glass-bar idiom as `PanelHeaderBar`.
 */
export function PanelTabsHeader({
  tabs,
  activeKey,
  onSelect,
  actions,
}: {
  tabs: PanelTab[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  actions?: ReactNode;
}) {
  // "Usable" = navigable; disabled hint tabs don't make a strip worth rendering.
  const usableTabs = tabs.filter((tab) => !tab.disabled);
  const single = usableTabs.length <= 1;
  // Roving tabindex: the active tab is the strip's single tab stop; arrows move within.
  const focusKey =
    usableTabs.find((tab) => tab.key === activeKey)?.key ?? usableTabs[0]?.key;

  const handleTablistKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabEls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([aria-disabled="true"])'),
    );
    if (tabEls.length === 0) return;
    const current = tabEls.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowRight"
        ? (current + 1) % tabEls.length
        : event.key === "ArrowLeft"
          ? (current - 1 + tabEls.length) % tabEls.length
          : event.key === "Home"
            ? 0
            : tabEls.length - 1;
    event.preventDefault();
    tabEls[next]?.focus();
  };

  return (
    <header className={panelHeaderBarClass}>
      {single ? (
        <div className="flex min-w-0 items-center gap-2">
          {usableTabs[0] ? (
            <PanelTitleLabel>{usableTabs[0].label}</PanelTitleLabel>
          ) : null}
        </div>
      ) : (
        <div
          role="tablist"
          onKeyDown={handleTablistKeyDown}
          className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
        >
          {tabs.map((tab) =>
            tab.disabled ? (
              <span
                key={tab.key}
                role="tab"
                aria-disabled="true"
                aria-selected={false}
                className="flex shrink-0 cursor-default items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-muted-foreground/50"
              >
                {tab.label}
                {tab.hint ? (
                  <span className="text-[10px] font-medium text-muted-foreground/50">
                    {tab.hint}
                  </span>
                ) : null}
              </span>
            ) : (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={tab.key === activeKey}
                tabIndex={tab.key === focusKey ? 0 : -1}
                onClick={() => onSelect(tab.key)}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors",
                  tab.key === activeKey
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ),
          )}
        </div>
      )}
      {actions ? (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      ) : null}
    </header>
  );
}

/**
 * Expand toggle for the panel header's action cluster (left of the close toggle):
 * widens the inline panel to the expanded 30:70 split with main (panel takes 70).
 * Renders nothing in the narrow-viewport drawer (already full-width) or outside
 * `DetailSplitLayout`.
 */
export function PanelExpandButton() {
  const expand = usePanelExpand();
  if (!expand || !expand.canExpand) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={() => expand.setExpanded(!expand.expanded)}
      aria-label={expand.expanded ? "Kecilkan panel" : "Perluas panel"}
      aria-pressed={expand.expanded}
    >
      {expand.expanded ? (
        <ShrinkIcon className="size-3.5" />
      ) : (
        <ExpandIcon className="size-3.5" />
      )}
    </Button>
  );
}

/**
 * Compact toolbar at the TOP of the floating card — home for what used to sit on the flush
 * header bar (panel title, switchers, export / More actions) now that the flush bar carries
 * tabs + close. Mirrors `PanelHeaderBar`'s title/actions clusters at card scale.
 */
export function PanelCardToolbar({
  title,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className={panelCardToolbarClass}>
      <PanelBarContent title={title} eyebrow={eyebrow} actions={actions} />
    </div>
  );
}

/**
 * After the open button unmounts (it hides while the panel is open), focus lands on
 * <body>; hand it to the panel's close toggle (`data-panel-close`, on
 * `PanelCloseButton`) so keyboard/screen-reader context follows the panel. Retries a
 * few frames — panel content can mount async (URL-driven modes).
 */
function focusPanelClose(attempt = 0) {
  if (document.activeElement !== document.body) return; // user moved on — don't steal
  const target = document.querySelector<HTMLElement>("[data-panel-close]");
  if (target) {
    target.focus();
    return;
  }
  if (attempt < 20) requestAnimationFrame(() => focusPanelClose(attempt + 1));
}

/**
 * Open affordance for a closed side panel — the pill on the page/main header. Hidden
 * while the panel is open: closing lives on the panel header's close toggle
 * (`PanelCloseButton`), never here. Shared by every host header (thread, explore,
 * reader, workspace board, artifact page) so the pill can't drift per surface.
 */
export function PanelOpenButton({
  open,
  onOpen,
  icon,
  label,
  ariaLabel,
}: {
  open: boolean;
  onOpen: () => void;
  icon: ReactNode;
  /** Omit for the icon-only (circular) form. */
  label?: string;
  ariaLabel: string;
}) {
  if (open) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onOpen();
        requestAnimationFrame(() => focusPanelClose());
      }}
      aria-label={ariaLabel}
      className={cn(
        "flex shrink-0 items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        label
          ? "gap-1.5 px-2.5 py-1 text-[12px] font-semibold"
          : "size-7 justify-center",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
