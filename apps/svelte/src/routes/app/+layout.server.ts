import type { LayoutServerLoad } from './$types';
import { SIDEBAR_STATE_COOKIE, isSidebarOpenFromCookie } from '$lib/sidebar-state';

/**
 * Reads the persisted sidebar open state from the `sidebar_state` cookie (written by
 * `Sidebar.Provider` on toggle) so the shell renders in the right state on first paint,
 * with no flash — padanan web `app/app/(product)/layout.tsx` reading `sidebar_state`.
 * Auth + onboarding gating already happened in `hooks.server.ts` (Phase 2).
 */
export const load: LayoutServerLoad = ({ cookies }) => {
	return { sidebarOpen: isSidebarOpenFromCookie(cookies.get(SIDEBAR_STATE_COOKIE)) };
};
