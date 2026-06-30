import * as React from "react";
import { PANEL_INLINE_MEDIA_QUERY } from "@/lib/panel-surface";

const MOBILE_BREAKPOINT = 768;

// One MediaQueryList per query, shared across every subscriber and every render. Without
// this cache, `getSnapshot` would call `window.matchMedia(query)` on every render — each
// call allocates a fresh MediaQueryList and re-parses the query — and the three components
// that gate on the same panel breakpoint would each hold a separate listener for it.
const mediaQueryLists = new Map<string, MediaQueryList>();

function getMediaQueryList(query: string) {
  let media = mediaQueryLists.get(query);
  if (!media) {
    media = window.matchMedia(query);
    mediaQueryLists.set(query, media);
  }
  return media;
}

/**
 * Subscribe to a CSS media query. `defaultValue` is the SSR / first-paint result
 * (before `matchMedia` is available) — pass the value that matches the most common
 * client so hydration doesn't flash the layout.
 */
export function useMediaQuery(query: string, defaultValue = false) {
  const subscribe = React.useCallback(
    (callback: () => void) => {
      const media = getMediaQueryList(query);
      media.addEventListener("change", callback);
      return () => media.removeEventListener("change", callback);
    },
    [query],
  );

  return React.useSyncExternalStore(
    subscribe,
    () => getMediaQueryList(query).matches,
    () => defaultValue,
  );
}

export function useIsMobile() {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
}

/**
 * Whether the detail side-panel docks inline (wide viewport) vs. overlays as a bottom
 * drawer (narrow). The single source for the inline breakpoint + its SSR default —
 * shared by `DetailSplitLayout` (grid columns), `ResponsiveSidePanel` (inset vs. drawer),
 * and `SidePanelFrame` (card vs. flush) so the three can never disagree. Defaults to
 * `true` (inline) for first paint, matching the most common desktop client.
 */
export function usePanelInline() {
  return useMediaQuery(PANEL_INLINE_MEDIA_QUERY, true);
}
