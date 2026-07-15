<script module lang="ts">
	export type RecentThreadSummary = { threadId: string; title: string; lastActivityAt: number };
</script>

<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Icon, ChevronDownIcon } from '$lib/icons';
	import { cn } from '$lib/utils';

	/**
	 * Quick-switch dropdown for the compact chat panel — top 4 recent threads (by activity) + "new".
	 * `PanelTitleDropdownTrigger` is inlined here.
	 */
	let {
		title,
		threads,
		onSelectThread,
		onNewThread,
		newLabel,
		emptyLabel
	}: {
		title: string;
		threads: RecentThreadSummary[];
		onSelectThread: (threadId: string) => void;
		onNewThread: () => void;
		newLabel: string;
		emptyLabel: string;
	} = $props();

	const triggerClass =
		'inline-flex h-auto min-w-0 max-w-[min(100%,18rem)] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-normal leading-snug text-foreground transition-colors hover:bg-transparent aria-expanded:bg-transparent aria-expanded:text-foreground';

	const recentThreads = $derived(
		[...threads].sort((a, b) => b.lastActivityAt - a.lastActivityAt).slice(0, 4)
	);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button {...props} type="button" class={triggerClass}>
				<span class="flex min-w-0 items-center gap-1.5 overflow-hidden">
					<span class="truncate">{title}</span>
				</span>
				<Icon icon={ChevronDownIcon} class="size-3 shrink-0 text-muted-foreground" />
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" class="max-h-64 w-64 overflow-y-auto">
		<DropdownMenu.Item onclick={onNewThread}>{newLabel}</DropdownMenu.Item>
		{#if recentThreads.length === 0}
			<DropdownMenu.Item disabled>{emptyLabel}</DropdownMenu.Item>
		{:else}
			{#each recentThreads as thread (thread.threadId)}
				<DropdownMenu.Item onclick={() => onSelectThread(thread.threadId)}>
					<span class={cn('truncate')}>{thread.title}</span>
				</DropdownMenu.Item>
			{/each}
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
