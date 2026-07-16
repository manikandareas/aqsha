<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useClerkContext } from 'svelte-clerk';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, LayersIcon, PanelLeftIcon } from '$lib/icons';
	import PanelOpenButton from '$lib/components/layout/PanelOpenButton.svelte';
	import PanelTitleLabel from '$lib/components/layout/PanelTitleLabel.svelte';
	import { panelHeaderBarClass } from '$lib/components/layout/panel-surface';
	import ThreadRecentSwitcher from '$lib/features/explore/components/ThreadRecentSwitcher.svelte';
	import { useDeleteThread, useThread } from '$lib/features/threads/api';
	import { threadTitle } from '$lib/features/threads/types';
	import { useRecentThreadSummaries } from '$lib/features/threads/use-recent-thread-summaries.svelte';
	import ThreadActionsMenu from './ThreadActionsMenu.svelte';

	/**
	 * Thread surface header — owns switcher data, title, and delete. Parent only wires chrome that
	 * lives outside this tree (left-nav sidebar + right context panel).
	 */
	let {
		threadId,
		showLeftTrigger,
		onToggleLeftSidebar,
		contextPanelOpen,
		onOpenContextPanel
	}: {
		threadId?: string;
		showLeftTrigger: boolean;
		onToggleLeftSidebar: () => void;
		contextPanelOpen: boolean;
		onOpenContextPanel: () => void;
	} = $props();

	const clerk = useClerkContext();
	const clerkReady = $derived(clerk.isLoaded && Boolean(clerk.auth.userId));
	const isExisting = $derived(Boolean(threadId));

	const recentThreads = useRecentThreadSummaries(() => isExisting && clerkReady);
	const threadDetail = useThread(
		() => threadId ?? '',
		() => isExisting && clerkReady
	);
	const deleteThread = useDeleteThread();

	const title = $derived(
		isExisting ? threadTitle(threadDetail.data ?? { title: null }) : 'Thread baru'
	);

	async function handleDeleteThread(): Promise<void> {
		if (!threadId) return;
		await deleteThread.mutateAsync({ id: threadId });
		await goto(resolve('/app'), { replaceState: true });
	}

	function selectThread(id: string): void {
		void goto(resolve('/app/(product)/threads/[threadId]', { threadId: id }));
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
				threads={recentThreads.data}
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
