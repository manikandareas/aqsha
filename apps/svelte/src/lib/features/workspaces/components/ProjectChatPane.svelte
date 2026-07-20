<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useClerkContext } from 'svelte-clerk';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import PanelCardToolbar from '$lib/components/layout/PanelCardToolbar.svelte';
	import ExploreThreadChat from '$lib/features/explore/components/ExploreThreadChat.svelte';
	import ThreadRecentSwitcher from '$lib/features/explore/components/ThreadRecentSwitcher.svelte';
	import { useRecentThreadSummaries } from '$lib/features/threads/use-recent-thread-summaries.svelte';
	import { Icon, ExternalLinkIcon, MessageSquarePlusIcon } from '$lib/icons';

	let {
		workspaceId,
		getExtraClientContext,
		onTurnSent,
		onAgentSettled
	}: {
		workspaceId: string;
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
	let chatMountKey = $state(0);

	function selectThread(id: string | null): void {
		activeThreadId = id;
		chatMountKey += 1;
	}

	function openFull(): void {
		if (!activeThreadId) return;
		void goto(
			resolve('/app/(product)/projects/[projectId]/threads/[threadId]', {
				projectId: workspaceId,
				threadId: activeThreadId
			})
		);
	}

	// Keep the new thread mounted when its first turn promotes it to a durable thread.
	function handleAgentSettled(threadId: string): void {
		if (activeThreadId === null) activeThreadId = threadId;
		onAgentSettled?.(threadId);
	}
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
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

	<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
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
</div>
