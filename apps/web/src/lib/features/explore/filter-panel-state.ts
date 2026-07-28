/**
 * Persisted open state for Explore's filter rail. Stored as its own cookie rather than reusing the
 * nav sidebar's `sidebar_state`, which drives an unrelated surface, and read server-side so a
 * restored-open rail is already docked on first paint instead of snapping open after hydration.
 */
export const EXPLORE_FILTER_PANEL_COOKIE = 'explore_filters_state';

const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * Closed unless explicitly `true` — inverted from the nav sidebar, which defaults open. A filter
 * rail nobody has opened yet should not greet a first visit already taking a quarter of the width.
 */
export function isFilterPanelOpenFromCookie(value: string | undefined): boolean {
	return value === 'true';
}

/** Writes what `isFilterPanelOpenFromCookie` reads. Browser-only; call from event handlers. */
export function writeFilterPanelCookie(open: boolean): void {
	document.cookie = `${EXPLORE_FILTER_PANEL_COOKIE}=${open}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}
