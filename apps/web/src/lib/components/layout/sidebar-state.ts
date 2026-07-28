/**
 * Pure codec for the persisted sidebar open state. `Sidebar.Provider` writes the `sidebar_state`
 * cookie as the literal `true`/`false`; the shell reads it server-side to render in the right state
 * with no flash. Open unless explicitly `false`.
 */
export const SIDEBAR_STATE_COOKIE = 'sidebar_state';

export function isSidebarOpenFromCookie(value: string | undefined): boolean {
	return value !== 'false';
}
