<script lang="ts">
	import { Skeleton } from '@aqsha/ui-svelte/components/skeleton';
	import ExploreSourceListSkeleton from './ExploreSourceListSkeleton.svelte';

	/**
	 * Whole-surface stand-in for `LiteratureResults`: result-count line, sort control, then the row
	 * list. Mirrors the same responsive toolbar so the header does not reflow once results land.
	 */
	let { count = 5 }: { count?: number } = $props();
</script>

<div class="flex flex-col gap-4">
	<div
		class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3"
	>
		<Skeleton class="h-4 w-28" />
		<div class="flex w-full items-center gap-1.5 sm:w-auto">
			<Skeleton class="h-4 w-16 shrink-0" />
			<Skeleton class="h-10 min-w-0 flex-1 rounded-md sm:w-56 sm:flex-none" />
		</div>
	</div>

	<ExploreSourceListSkeleton {count} label="Memuat hasil pencarian…" />
</div>
