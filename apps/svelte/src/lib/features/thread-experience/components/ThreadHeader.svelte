<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, LayersIcon, PanelLeftIcon } from '$lib/icons';
	import PanelOpenButton from '$lib/components/layout/PanelOpenButton.svelte';
	import PanelTitleLabel from '$lib/components/layout/PanelTitleLabel.svelte';
	import { panelHeaderBarClass } from '$lib/components/layout/panel-surface';
	import ThreadRecentSwitcher from '$lib/features/explore/components/ThreadRecentSwitcher.svelte';
	import { useDeleteThread } from '$lib/features/threads/api';
	import type { RecentThreadSummary } from '$lib/features/threads/types';
	import ThreadActionsMenu from './ThreadActionsMenu.svelte';

	/**
	 * Thread surface header chrome — title, recent switcher, delete, and context panel trigger.
	 * Data fetching stays in the parent shell so `useThread` runs once per tree.
	 */
	let {
		threadId,
		title,
		isExisting = Boolean(threadId),
		recentThreads = [],
		showLeftTrigger,
		onToggleLeftSidebar,
		contextPanelOpen,
		onOpenContextPanel,
		threadUrlFor
	}: {
		threadId?: string;
		title: string;
		isExisting?: boolean;
		recentThreads?: RecentThreadSummary[];
		showLeftTrigger: boolean;
		onToggleLeftSidebar: () => void;
		contextPanelOpen: boolean;
		onOpenContextPanel: () => void;
		/** Builds a thread's route (lives under its project); switching threads is a no-op without it. */
		threadUrlFor?: (threadId: string) => string;
	} = $props();

	const deleteThread = useDeleteThread();

	async function handleDeleteThread(): Promise<void> {
		if (!threadId) return;
		await deleteThread.mutateAsync({ id: threadId });
		await goto(resolve('/app'), { replaceState: true });
	}

	function selectThread(id: string): void {
		if (threadUrlFor) void goto(threadUrlFor(id));
	}

	function createThread(): void {
		void goto(resolve('/app'));
	}
</script>

<header class={panelHeaderBarClass}>
	<div class="flex min-w-0 items-center gap-1.5">
		{#if showLeftTrigger}
			<Button
				type="button"
				variant="ghost"
				class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
				onclick={onToggleLeftSidebar}
				aria-label="Buka sidebar kiri"
			>
				<Icon icon={PanelLeftIcon} class="size-3.5" />
			</Button>
		{/if}
		{#if isExisting}
			<ThreadRecentSwitcher
				{title}
				threads={recentThreads}
				onSelectThread={selectThread}
				onNewThread={createThread}
				newLabel="Thread baru"
				emptyLabel="Belum ada thread"
			/>
		{:else}
			<PanelTitleLabel>{title}</PanelTitleLabel>
		{/if}
	</div>
	<div class="flex shrink-0 items-center gap-1">
		{#if threadId}
			<ThreadActionsMenu
				description="Thread dan pesannya akan dihapus permanen."
				onDelete={handleDeleteThread}
			/>
		{/if}
		<PanelOpenButton
			open={contextPanelOpen}
			onOpen={onOpenContextPanel}
			label="Panel"
			ariaLabel="Buka panel samping"
		>
			{#snippet icon()}
				<Icon icon={LayersIcon} class="size-3.5" />
			{/snippet}
		</PanelOpenButton>
	</div>
</header>
