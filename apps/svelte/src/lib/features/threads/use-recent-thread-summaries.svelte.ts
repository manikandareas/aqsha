import { usePinnedThreads, useThreadsList } from './api';
import { mergeRecentThreadSummaries } from './lib/recent-thread-summaries';
import type { RecentThreadSummary } from './types';

const always = () => true;

/**
 * Pinned + recent thread list for switchers / landing suggestions. Must be called during component
 * init (uses query context). `data` is a getter so template / `$derived` reads stay reactive.
 */
export function useRecentThreadSummaries(enabled: () => boolean = always) {
	const threadsList = useThreadsList(enabled);
	const pinnedThreads = usePinnedThreads(enabled);
	const data = $derived(mergeRecentThreadSummaries(pinnedThreads.data, threadsList.data?.pages));

	return {
		get data(): RecentThreadSummary[] {
			return data;
		}
	};
}
