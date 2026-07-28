<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useClerkContext } from 'svelte-clerk';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import PanelCardToolbar from '$lib/components/layout/PanelCardToolbar.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import ThreadRecentSwitcher from '$lib/features/explore/components/ThreadRecentSwitcher.svelte';
	import { useRecentThreadSummaries } from '$lib/features/threads/use-recent-thread-summaries.svelte';
	import { Icon, ExternalLinkIcon, MessageSquarePlusIcon } from '$lib/icons';
	import { getProjectChatRuntime } from './project-chat-runtime-context.svelte';

	let {
		leading,
		getExtraClientContext,
		suggestions
	}: {
		/** Rendered on the toolbar's left — the page's chat/editor panel toggle. */
		leading?: Snippet;
		getExtraClientContext?: () => string[];
		/** Opening prompts derived from this project's document state. */
		suggestions?: readonly { label: string; prompt: string }[];
	} = $props();

	const runtime = getProjectChatRuntime();
	const agent = $derived(runtime.agent);
	const phaseKind = $derived(runtime.phase.kind);
	const clerk = useClerkContext();
	const recentThreads = useRecentThreadSummaries(
		() => clerk.isLoaded && Boolean(clerk.auth.userId),
		() => runtime.workspaceId
	);
	type ChatSurfaceComponent =
		(typeof import('$lib/features/thread-experience/components/MastraChatThreadSurface.svelte'))['default'];
	let ChatSurface = $state<ChatSurfaceComponent | null>(null);
	$effect(() => {
		if (!agent || ChatSurface) return;
		let cancelled = false;
		void import('$lib/features/thread-experience/components/MastraChatThreadSurface.svelte').then(
			({ default: Surface }) => {
				if (!cancelled) ChatSurface = Surface;
			}
		);
		return () => {
			cancelled = true;
		};
	});

	function openFull(): void {
		if (!runtime.activeThreadId) return;
		void goto(
			resolve('/app/(product)/projects/[projectId]/threads/[threadId]', {
				projectId: runtime.workspaceId,
				threadId: runtime.activeThreadId
			})
		);
	}
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
	<PanelCardToolbar>
		{#snippet title()}
			{#if leading}{@render leading()}{/if}
		{/snippet}
		{#snippet actions()}
			{#if runtime.activeThreadId}
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
			<ThreadRecentSwitcher
				title={runtime.activeThreadId ? 'Thread' : 'Chat baru'}
				threads={recentThreads.data}
				onSelectThread={runtime.selectThread}
				onNewThread={runtime.startNewThread}
				newLabel="Chat baru"
				emptyLabel="Belum ada thread di proyek ini"
			/>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
				aria-label="Chat baru"
				onclick={runtime.startNewThread}
			>
				<Icon icon={MessageSquarePlusIcon} class="size-3.5" />
			</Button>
		{/snippet}
	</PanelCardToolbar>

	<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
		{#if phaseKind === 'restore_failed'}
			<div class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
				<p class="text-sm text-destructive">Percakapan tidak tersedia atau gagal dipulihkan.</p>
				<Button type="button" size="sm" variant="outline" onclick={runtime.retryRestore}>
					Coba lagi
				</Button>
			</div>
		{:else if phaseKind === 'restoring' || !agent}
			<div class="flex flex-1 items-center justify-center gap-2 py-10 text-muted-foreground">
				<Spinner class="size-4" />
				<span class="text-sm">Memulihkan percakapan…</span>
			</div>
		{:else if ChatSurface}
			<ChatSurface
				{agent}
				threadId={runtime.threadId}
				threadAgentKind={runtime.threadAgentKind}
				threadPersisted={runtime.threadPersisted}
				compact
				bindUrlOnSend={false}
				{getExtraClientContext}
				{suggestions}
				onTurnSent={runtime.onTurnSent}
			/>
		{:else}
			<div class="flex flex-1 flex-col justify-end gap-3 p-4 text-muted-foreground">
				<div class="h-16 w-2/3 animate-pulse rounded-xl bg-muted"></div>
				<div class="rounded-2xl border-2 border-border bg-card px-4 py-3 text-sm">
					Astra sedang disiapkan…
				</div>
			</div>
		{/if}
	</div>
</div>
