<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import SidePanelFrame from '$lib/components/layout/SidePanelFrame.svelte';
	import PanelTabsHeader from '$lib/components/layout/PanelTabsHeader.svelte';
	import PanelCardToolbar from '$lib/components/layout/PanelCardToolbar.svelte';
	import PanelExpandButton from '$lib/components/layout/PanelExpandButton.svelte';
	import type { PanelTab } from '$lib/components/layout/PanelTabsHeader.svelte';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, ExternalLinkIcon, MessageSquarePlusIcon, XIcon } from '$lib/icons';
	import { useClerkContext } from 'svelte-clerk';
	import ExploreThreadChat from '$lib/features/explore/components/ExploreThreadChat.svelte';
	import ThreadRecentSwitcher from '$lib/features/explore/components/ThreadRecentSwitcher.svelte';
	import { useRecentThreadSummaries } from '$lib/features/threads/use-recent-thread-summaries.svelte';
	import ProjectSourcesPanel from './ProjectSourcesPanel.svelte';
	import type { WorkspaceSection } from '../types';

	/** Panel kanan rumah proyek: chat ber-scope proyek + koleksi sumber + thread terbaru. */
	const TABS: PanelTab[] = [
		{ key: 'chat', label: 'Chat' },
		{ key: 'sources', label: 'Sumber' }
	];

	let {
		workspaceId,
		workspaceName,
		sections,
		activeTab,
		onTabChange,
		onClose,
		getExtraClientContext,
		onTurnSent,
		onAgentSettled
	}: {
		workspaceId: string;
		workspaceName: string;
		sections: WorkspaceSection[];
		activeTab: 'chat' | 'sources';
		onTabChange: (tab: 'chat' | 'sources') => void;
		onClose: () => void;
		getExtraClientContext?: () => string[];
		onTurnSent?: (threadId: string) => void;
		onAgentSettled?: (threadId: string) => void;
	} = $props();

	const clerk = useClerkContext();
	const recentThreads = useRecentThreadSummaries(
		() => clerk.isLoaded && Boolean(clerk.auth.userId),
		() => workspaceId
	);

	let activeThreadId = $state<string | null>(null);
	// Kunci mount surface chat. Hanya di-bump saat pindah thread / chat baru SECARA EKSPLISIT — bukan
	// saat promosi thread di bawah — supaya promosi tak me-remount & mengosongkan percakapan yang
	// sedang tampil (Mastra listMessages belum konsisten tepat setelah thread dibuat).
	let chatMountKey = $state(0);

	function selectThread(id: string | null) {
		activeThreadId = id;
		chatMountKey += 1;
	}

	function openFull() {
		if (!activeThreadId) return;
		void goto(
			resolve('/app/(product)/projects/[projectId]/threads/[threadId]', {
				projectId: workspaceId,
				threadId: activeThreadId
			})
		);
	}

	// Promosikan thread chat-baru ke activeThreadId begitu turn pertamanya selesai. Tanpa ini id
	// thread hanya hidup di dalam ExploreThreadChat, jadi remount berikutnya (pindah tab Chat↔Sumber)
	// memulai thread kosong baru dan percakapan hilang. TIDAK mem-bump chatMountKey → tak remount →
	// percakapan di memori tetap tampil, label jadi "Thread", dan remount tab berikutnya memuat ulang
	// thread yang sama (Mastra sudah konsisten saat itu). Pesan berikutnya menyambung ke thread ini.
	function handleAgentSettled(threadId: string) {
		if (activeThreadId === null) activeThreadId = threadId;
		onAgentSettled?.(threadId);
	}
</script>

<SidePanelFrame>
	{#snippet header()}
		<PanelTabsHeader
			tabs={TABS}
			activeKey={activeTab}
			onSelect={(key) => onTabChange(key as 'chat' | 'sources')}
		>
			{#snippet actions()}
				<PanelExpandButton />
				<Button
					type="button"
					variant="ghost"
					size="icon"
					class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label={`Tutup panel ${workspaceName}`}
					onclick={onClose}
				>
					<Icon icon={XIcon} class="size-4" />
				</Button>
			{/snippet}
		</PanelTabsHeader>
	{/snippet}

	{#if activeTab === 'sources'}
		<ProjectSourcesPanel {workspaceId} {sections} />
	{:else}
		<PanelCardToolbar>
			{#snippet title()}
				<ThreadRecentSwitcher
					title={activeThreadId ? 'Thread' : 'Chat baru'}
					threads={recentThreads.data}
					onSelectThread={(id) => selectThread(id)}
					onNewThread={() => selectThread(null)}
					newLabel="Chat baru"
					emptyLabel="Belum ada thread di proyek ini"
				/>
			{/snippet}
			{#snippet actions()}
				{#if activeThreadId}
					<Button
						type="button"
						variant="ghost"
						size="icon"
						class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
						aria-label="Buka thread penuh"
						onclick={openFull}
					>
						<Icon icon={ExternalLinkIcon} class="size-3.5" />
					</Button>
				{/if}
				<Button
					type="button"
					variant="ghost"
					size="icon"
					class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label="Chat baru"
					onclick={() => selectThread(null)}
				>
					<Icon icon={MessageSquarePlusIcon} class="size-3.5" />
				</Button>
			{/snippet}
		</PanelCardToolbar>

		<div class="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden bg-background">
			{#key chatMountKey}
				<ExploreThreadChat
					{activeThreadId}
					{workspaceId}
					{getExtraClientContext}
					{onTurnSent}
					onAgentSettled={handleAgentSettled}
				/>
			{/key}
		</div>
	{/if}
</SidePanelFrame>
