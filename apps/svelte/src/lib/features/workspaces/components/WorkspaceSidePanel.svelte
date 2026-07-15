<script lang="ts">
	import { buildWorkspaceCitationMentionLabel } from '@aqsha/chat-core';
	import SidePanelFrame from '$lib/components/layout/SidePanelFrame.svelte';
	import PanelTabsHeader from '$lib/components/layout/PanelTabsHeader.svelte';
	import PanelCardToolbar from '$lib/components/layout/PanelCardToolbar.svelte';
	import PanelExpandButton from '$lib/components/layout/PanelExpandButton.svelte';
	import type { PanelTab } from '$lib/components/layout/PanelTabsHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Icon, MessageSquarePlusIcon, XIcon } from '$lib/icons';
	import { cn } from '$lib/utils';
	import { panelBodyPaddingClass } from '$lib/panel-surface';
	import { getComposerMentions } from '$lib/features/threads/state/composer-mentions.svelte';
	import { useThread } from '$lib/features/threads/api';
	import { threadTitle } from '$lib/features/threads/types';
	import ExploreThreadChat from '$lib/features/explore/components/ExploreThreadChat.svelte';
	import ThreadRecentSwitcher, {
		type RecentThreadSummary
	} from '$lib/features/explore/components/ThreadRecentSwitcher.svelte';
	import ThreadActionsMenu from '$lib/features/explore/components/ThreadActionsMenu.svelte';
	import AccessDeniedState from '$lib/features/explore/components/AccessDeniedState.svelte';
	import CitationsPanel from '$lib/features/citations/components/CitationsPanel.svelte';
	import type { SidebarThread } from '../api/use-workspaces-data';
	import { getWorkspacePanel } from './workspace-panel-context.svelte';

	/**
	 * Workspace-detail right panel with `Chat · Sitasi` tabs — Svelte port of `workspace-side-panel.tsx`
	 * (+ `workspace-chat-side-panel.tsx`). The frame + tab strip live here; each tab contributes its body.
	 * Mode comes from the URL-backed `WorkspacePanelController` (`?panel=` / `?panel=cite:<id>`). The chat
	 * tab reuses the compact `ExploreThreadChat` (shares the page-level `ComposerMentions` so the workspace
	 * `@Workspace` ambient pill + citation refs reach the composer).
	 */
	const CHAT_CITATIONS_TABS: PanelTab[] = [
		{ key: 'chat', label: 'Chat' },
		{ key: 'citations', label: 'Sitasi' }
	];

	let {
		workspaceId,
		activeThreadId,
		onActiveThreadIdChange,
		threads
	}: {
		workspaceId: string;
		activeThreadId: string | null;
		onActiveThreadIdChange: (threadId: string | null) => void;
		threads: SidebarThread[];
	} = $props();

	const panel = getWorkspacePanel();
	const mentions = getComposerMentions();
	const mode = $derived(panel.mode);
	const showCitations = $derived(mode.kind === 'citations');
	const activeCitationId = $derived(mode.kind === 'citations' ? (mode.citationId ?? null) : null);

	const selectedThread = useThread(
		() => activeThreadId ?? '',
		() => Boolean(activeThreadId)
	);

	const switcherThreads = $derived<RecentThreadSummary[]>(
		threads.map((thread) => ({
			threadId: thread.threadId,
			title: thread.title,
			lastActivityAt: thread.lastActivityAt
		}))
	);
	const headerLabel = $derived(
		activeThreadId && selectedThread.data ? threadTitle(selectedThread.data) : 'Chat baru'
	);
	const accessDenied = $derived(
		Boolean(activeThreadId) && !selectedThread.isPending && selectedThread.data === null
	);

	// Pin a citation into the chat composer then jump to the Chat tab so the chip is visible.
	function addCitationToChat(citation: { id: string; title: string }) {
		mentions.addSelectionRef({
			kind: 'workspace-citation',
			workspaceId,
			citationId: citation.id,
			label: buildWorkspaceCitationMentionLabel(citation.title)
		});
		panel.openChat();
	}
</script>

<SidePanelFrame>
	{#snippet header()}
		<PanelTabsHeader
			tabs={CHAT_CITATIONS_TABS}
			activeKey={showCitations ? 'citations' : 'chat'}
			onSelect={(key) => (key === 'citations' ? panel.openCitations() : panel.openChat())}
		>
			{#snippet actions()}
				<PanelExpandButton />
				<Button
					type="button"
					variant="ghost"
					size="icon"
					class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label="Tutup panel"
					data-panel-close
					onclick={() => panel.closePanel()}
				>
					<Icon icon={XIcon} class="size-4" />
				</Button>
			{/snippet}
		</PanelTabsHeader>
	{/snippet}

	{#if showCitations}
		<CitationsPanel
			{workspaceId}
			citationId={activeCitationId}
			onOpenCitation={(id) => panel.openCitationDetail(id)}
			onBackToList={() => panel.openCitations()}
			onAddToChat={addCitationToChat}
		/>
	{:else}
		<PanelCardToolbar>
			{#snippet title()}
				<ThreadRecentSwitcher
					title={headerLabel}
					threads={switcherThreads}
					onSelectThread={onActiveThreadIdChange}
					onNewThread={() => onActiveThreadIdChange(null)}
					newLabel="Chat baru"
					emptyLabel="Belum ada thread"
				/>
			{/snippet}
			{#snippet actions()}
				{#if activeThreadId}
					<ThreadActionsMenu
						description="Thread dan pesannya akan dihapus permanen dari workspace ini."
						onDelete={async () => onActiveThreadIdChange(null)}
					/>
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
	{/if}
</SidePanelFrame>
