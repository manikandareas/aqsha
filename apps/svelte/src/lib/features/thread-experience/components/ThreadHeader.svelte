<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Icon, LayersIcon } from '$lib/icons';
	import AppPageHeader from '$lib/components/layout/AppPageHeader.svelte';
	import PanelOpenButton from '$lib/components/layout/PanelOpenButton.svelte';
	import PanelTitleLabel from '$lib/components/layout/PanelTitleLabel.svelte';
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
		title: pageTitle,
		isExisting = Boolean(threadId),
		recentThreads = [],
		contextPanelOpen,
		onOpenContextPanel,
		threadUrlFor
	}: {
		threadId?: string;
		title: string;
		isExisting?: boolean;
		recentThreads?: RecentThreadSummary[];
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
		// threadUrlFor already returns a resolve()'d href from the shell.
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- pre-resolved by caller
		if (threadUrlFor) void goto(threadUrlFor(id));
	}

	function createThread(): void {
		void goto(resolve('/app'));
	}
</script>

<AppPageHeader>
	{#snippet title()}
		{#if isExisting}
			<ThreadRecentSwitcher
				title={pageTitle}
				threads={recentThreads}
				onSelectThread={selectThread}
				onNewThread={createThread}
				newLabel="Thread baru"
				emptyLabel="Belum ada thread"
			/>
		{:else}
			<PanelTitleLabel>{pageTitle}</PanelTitleLabel>
		{/if}
	{/snippet}
	{#snippet actions()}
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
	{/snippet}
</AppPageHeader>
