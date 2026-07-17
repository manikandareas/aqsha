import { usePinnedThreads, useThreadsList } from './api';
import { mergeRecentThreadSummaries } from './lib/recent-thread-summaries';
import type { RecentThreadSummary } from './types';

const always = () => true;

/**
 * Pinned + recent thread list for switchers / landing suggestions. Must be called during component
 * init (uses query context). `data` is a getter so template / `$derived` reads stay reactive.
 *
 * `workspaceId` scopes the list to a project's threads. Pins are a global concept (the
 * `/threads/pinned` endpoint isn't workspace-scoped), so the pinned group is only folded in for the
 * global (unscoped) list — a project view just shows activity order.
 */
export function useRecentThreadSummaries(
	enabled: () => boolean = always,
	workspaceId: () => string | null = () => null
) {
	const threadsList = useThreadsList(enabled, workspaceId);
	const pinnedThreads = usePinnedThreads(() => enabled() && workspaceId() === null);
	const data = $derived(
		mergeRecentThreadSummaries(
			workspaceId() === null ? pinnedThreads.data : undefined,
			threadsList.data?.pages
		)
	);

	return {
		get data(): RecentThreadSummary[] {
			return data;
		}
	};
}
