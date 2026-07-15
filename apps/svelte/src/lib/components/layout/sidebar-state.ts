/**
 * Pure codec for the persisted sidebar open state (§10 Phase 3 gate — "cookie codec
 * sidebar-collapsed" correctness test). `Sidebar.Provider` writes the `sidebar_state`
 * cookie as the literal `true`/`false`; the shell reads it server-side to render in the
 * right state with no flash. Open unless explicitly `false` — padanan web
 * `cookieStore.get("sidebar_state")?.value !== "false"` (app/app/(product)/layout.tsx).
 */
export const SIDEBAR_STATE_COOKIE = 'sidebar_state';

export function isSidebarOpenFromCookie(value: string | undefined): boolean {
	return value !== 'false';
}
