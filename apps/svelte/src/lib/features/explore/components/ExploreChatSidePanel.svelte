<script lang="ts">
	import SidePanelFrame from '$lib/components/layout/SidePanelFrame.svelte';
	import PanelHeaderBar from '$lib/components/layout/PanelHeaderBar.svelte';
	import PanelCardToolbar from '$lib/components/layout/PanelCardToolbar.svelte';
	import PanelExpandButton from '$lib/components/layout/PanelExpandButton.svelte';
	import PanelTitleLabel from '$lib/components/layout/PanelTitleLabel.svelte';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, MessageSquarePlusIcon, XIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { panelBodyPaddingClass } from '$lib/components/layout/panel-surface';
	import { useDeleteThread, useThread } from '$lib/features/threads/api';
	import { threadTitle } from '$lib/features/threads/types';
	import { useRecentThreadSummaries } from '$lib/features/threads/use-recent-thread-summaries.svelte';
	import AccessDeniedState from './AccessDeniedState.svelte';
	import ExploreThreadChat from './ExploreThreadChat.svelte';
	import ThreadRecentSwitcher from './ThreadRecentSwitcher.svelte';
	import ThreadActionsMenu from './ThreadActionsMenu.svelte';

	/**
	 * Workspace-less Astra chat for Explore — new threads start headless (like /app). Self-contained
	 * (threads list + detail from hooks); parent only holds `activeThreadId`. Reuses page-level
	 * `ComposerMentions` so "Tanya Astra" ambient refs reach this composer. Mounts only while open
	 * (`ResponsiveSidePanel`).
	 */
	let {
		activeThreadId,
		onActiveThreadIdChange,
		onClose,
		deleteDescription = 'Thread dan pesannya akan dihapus permanen.'
	}: {
		activeThreadId: string | null;
		onActiveThreadIdChange: (threadId: string | null) => void;
		onClose: () => void;
		deleteDescription?: string;
	} = $props();

	const recentThreads = useRecentThreadSummaries();
	const selectedThread = useThread(
		() => activeThreadId ?? '',
		() => Boolean(activeThreadId)
	);
	const deleteThread = useDeleteThread();

	const headerLabel = $derived(
		activeThreadId && selectedThread.data ? threadTitle(selectedThread.data) : 'Chat baru'
	);
	const accessDenied = $derived(
		Boolean(activeThreadId) && !selectedThread.isPending && selectedThread.data === null
	);

	async function onDelete(): Promise<void> {
		if (!activeThreadId) return;
		await deleteThread.mutateAsync({ id: activeThreadId });
		onActiveThreadIdChange(null);
	}
</script>

<SidePanelFrame>
	{#snippet header()}
		<PanelHeaderBar>
			{#snippet title()}
				<PanelTitleLabel>Chat</PanelTitleLabel>
			{/snippet}
			{#snippet actions()}
				<PanelExpandButton />
				<Button
					type="button"
					variant="ghost"
					size="icon"
					class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label="Tutup panel"
					data-panel-close
					onclick={onClose}
				>
					<Icon icon={XIcon} class="size-4" />
				</Button>
			{/snippet}
		</PanelHeaderBar>
	{/snippet}

	<PanelCardToolbar>
		{#snippet title()}
			<ThreadRecentSwitcher
				title={headerLabel}
				threads={recentThreads.data}
				onSelectThread={onActiveThreadIdChange}
				onNewThread={() => onActiveThreadIdChange(null)}
				newLabel="Chat baru"
				emptyLabel="Belum ada thread"
			/>
		{/snippet}
		{#snippet actions()}
			{#if activeThreadId}
				<ThreadActionsMenu description={deleteDescription} {onDelete} />
			{/if}
			<Button
				type="button"
				variant="ghost"
				class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
				aria-label="Chat baru"
				onclick={() => onActiveThreadIdChange(null)}
			>
				<Icon icon={MessageSquarePlusIcon} class="size-3.5" />
			</Button>
		{/snippet}
	</PanelCardToolbar>

	<div class="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden bg-background">
		{#if accessDenied}
			<div class={cn('flex min-h-0 flex-1 flex-col overflow-y-auto', panelBodyPaddingClass)}>
				<AccessDeniedState />
			</div>
		{:else}
			{#key activeThreadId ?? 'new'}
				<ExploreThreadChat {activeThreadId} />
			{/key}
		{/if}
	</div>
</SidePanelFrame>
