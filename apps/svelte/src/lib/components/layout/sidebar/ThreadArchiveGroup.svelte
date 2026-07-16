<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Icon, ChevronRightIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import type { SidebarThread } from '$lib/features/workspaces/api/use-workspaces-data';
	import { createPersistentCollapse } from './persistent-collapse.svelte';

	const OLD_THREADS_COLLAPSED_STORAGE_KEY = 'aqsha:sidebar:old-threads-collapsed';

	/**
	 * "More" group of older threads. Persisted collapse (default collapsed) but forced open while it
	 * contains the active thread. Each row is rendered via the `threadRow` snippet passed by the parent
	 * (shared with the recent group).
	 */
	let {
		threads,
		selectedThreadId,
		threadRow
	}: {
		threads: SidebarThread[];
		selectedThreadId?: string;
		threadRow: Snippet<[SidebarThread]>;
	} = $props();

	const collapse = createPersistentCollapse(OLD_THREADS_COLLAPSED_STORAGE_KEY, true);
	let animate = $state(false);

	const hasActiveThread = $derived(threads.some((thread) => thread.threadId === selectedThreadId));
	const collapsed = $derived(hasActiveThread ? false : collapse.collapsed);

	onMount(() => {
		const frame = requestAnimationFrame(() => (animate = true));
		return () => cancelAnimationFrame(frame);
	});
</script>

<div class="min-w-0 overflow-hidden pt-1">
	<button
		type="button"
		onclick={collapse.toggle}
		aria-expanded={!collapsed}
		class="-ml-1 flex min-w-0 items-center gap-1 rounded-[5px] px-1 py-0.5 text-left transition-[background-color] duration-150 ease-out hover:bg-muted/50"
	>
		<Icon
			icon={ChevronRightIcon}
			class={cn(
				'size-3 shrink-0 text-primary/55',
				animate ? 'transition-transform duration-200 ease-out' : null,
				collapsed ? 'rotate-0' : 'rotate-90'
			)}
		/>
		<span class="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">More</span>
		<span
			class="shrink-0 rounded-[5px] bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground"
		>
			{threads.length}
		</span>
	</button>
	<div
		class={cn(
			'grid',
			animate ? 'transition-[grid-template-rows] duration-200 ease-out' : null,
			collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
		)}
	>
		<div class="min-h-0 overflow-hidden pt-1">
			<Sidebar.Menu class="min-w-0 gap-1 overflow-hidden">
				{#each threads as thread (thread.threadId)}
					{@render threadRow(thread)}
				{/each}
			</Sidebar.Menu>
		</div>
	</div>
</div>
