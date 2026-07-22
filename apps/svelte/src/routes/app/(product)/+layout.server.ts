import type { LayoutServerLoad } from './$types';
import { dehydrate } from '@tanstack/svelte-query';
import {
	SIDEBAR_STATE_COOKIE,
	isSidebarOpenFromCookie
} from '$lib/components/layout/sidebar-state';
import { workspaceListQueryOptions } from '$lib/features/workspaces/query-options';
import { createQueryClient, queryBootstrapId } from '$lib/query';
import { createServerApiClient } from '$lib/server/api';

/**
 * Reads the persisted sidebar open state from the `sidebar_state` cookie (written by
 * `Sidebar.Provider` on toggle) so the shell renders in the right state on first paint,
 * with no flash. The parent `/app` server layout has already applied auth and onboarding gating.
 */
export const load: LayoutServerLoad = async ({ cookies, locals }) => {
	const auth = locals.auth();
	const api = createServerApiClient(() => auth.getToken());
	const queryClient = createQueryClient({ server: true });
	await queryClient.prefetchInfiniteQuery(
		workspaceListQueryOptions(api, { includeArchived: false, enabled: true })
	);

	return {
		sidebarOpen: isSidebarOpenFromCookie(cookies.get(SIDEBAR_STATE_COOKIE)),
		workspaceBootstrap: {
			id: queryBootstrapId('/app/(product)'),
			critical: dehydrate(queryClient),
			deferred: {}
		}
	};
};
