<script lang="ts">
	import SidePanelFrame from '$lib/components/layout/SidePanelFrame.svelte';
	import PanelHeaderBar from '$lib/components/layout/PanelHeaderBar.svelte';
	import PanelCardToolbar from '$lib/components/layout/PanelCardToolbar.svelte';
	import PanelExpandButton from '$lib/components/layout/PanelExpandButton.svelte';
	import PanelTitleLabel from '$lib/components/layout/PanelTitleLabel.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Icon, MessageSquarePlusIcon, XIcon } from '$lib/icons';
	import { cn } from '$lib/utils';
	import { panelBodyPaddingClass } from '$lib/components/layout/panel-surface';
	import {
		useDeleteThread,
		usePinnedThreads,
		useThread,
		useThreadsList
	} from '$lib/features/threads/api';
	import { threadTitle } from '$lib/features/threads/types';
	import AccessDeniedState from './AccessDeniedState.svelte';
	import ExploreThreadChat from './ExploreThreadChat.svelte';
	import ThreadRecentSwitcher, { type RecentThreadSummary } from './ThreadRecentSwitcher.svelte';
	import ThreadActionsMenu from './ThreadActionsMenu.svelte';

	/**
	 * Astra chat for the Explore surface — mirror of the web `ExploreChatSidePanel` + `CompactThreadChatPanel`
	 * but workspace-less: a new thread is born headless (like /app). Self-contained (threads list + thread
	 * detail read from hooks); the parent only holds `activeThreadId`. Reuses the page-level shared
	 * `ComposerMentions` (so Explore "Tanya Astra" ambient refs reach this composer). Only mounts while the
	 * panel is open (via `ResponsiveSidePanel`).
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

	const threadsList = useThreadsList();
	const pinnedThreads = usePinnedThreads();
	const selectedThread = useThread(
		() => activeThreadId ?? '',
		() => Boolean(activeThreadId)
	);
	const deleteThread = useDeleteThread();

	const threads = $derived.by<RecentThreadSummary[]>(() => {
		const merged = [
			...(pinnedThreads.data ?? []),
			...(threadsList.data?.pages ?? []).flatMap((p) => p.items)
		];
		const out: RecentThreadSummary[] = [];
		for (const t of merged) {
			if (!out.some((r) => r.threadId === t.id)) {
				out.push({ threadId: t.id, title: threadTitle(t), lastActivityAt: t.lastActivityAt });
			}
		}
		return out;
	});

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
				{threads}
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
