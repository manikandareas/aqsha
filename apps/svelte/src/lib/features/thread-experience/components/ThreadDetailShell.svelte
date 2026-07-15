<script lang="ts">
	import { untrack } from 'svelte';
	import { useClerkContext } from 'svelte-clerk';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { Spinner } from '$lib/components/ui/spinner';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import { clerkTokenGetter } from '$lib/auth/token';
	import { useThread } from '$lib/features/threads/api';
	import { ASTRA_AGENT_ID, createMastraClient } from '$lib/features/threads/lib/mastra-client';
	import { mastraMessagesToTimeline } from '$lib/features/threads/lib/mastra-timeline';
	import { ThreadAgent } from '$lib/features/threads/state/thread-agent.svelte';
	import {
		setComposerMentions,
		ComposerMentions
	} from '$lib/features/threads/state/composer-mentions.svelte';
	import { setThreadPanel, ThreadPanelController } from './thread-panel-context.svelte';
	import { isThreadPanelOpen } from '../utils/thread-panel-model';
	import MastraChatThreadSurface from './MastraChatThreadSurface.svelte';
	import DetailPanel from './DetailPanel.svelte';

	/**
	 * Thread-detail shell (THX-1/2) — the one place that owns the durable agent + the side-panel slot.
	 * Creates the per-tree contexts (composer mentions, panel controller), seeds the timeline from server
	 * memory (THX-8: 400-message history), spins up the `ThreadAgent` lifecycle, and lays out the surface
	 * (main) beside the responsive DetailPanel (`DetailSplitLayout` = inline inset ≥1100px / drawer below).
	 * A streamlined port of `thread-detail-shell.tsx` (workspace-library tab = Phase 9 seam).
	 */
	let {
		threadId: threadIdProp,
		compact = false,
		initialContent
	}: { threadId?: string; compact?: boolean; initialContent?: string } = $props();

	const clerk = useClerkContext();
	const qc = useQueryClient();
	const userId = $derived(clerk.auth.userId);
	const clerkLoaded = $derived(clerk.isLoaded);

	// Per-tree channels + panel controller (§3.5 — set once at init, never module singletons).
	const mentions = new ComposerMentions();
	setComposerMentions(mentions);
	const panel = new ThreadPanelController();
	setThreadPanel(panel);

	// Stable client-side thread id for a NEW thread (Mastra allows a client-chosen id).
	const newThreadId = untrack(() =>
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `t-${Date.now()}`
	);
	const threadId = $derived(threadIdProp ?? newThreadId);
	const isExistingThread = $derived(Boolean(threadIdProp));

	const client = createMastraClient(clerkTokenGetter(clerk));

	// Stored thread tier (read once, gated to an existing thread → no 404 for a new client id).
	const threadDetail = useThread(
		() => threadId,
		() => isExistingThread && clerkLoaded && Boolean(userId)
	);
	const threadAgentKind = $derived<'lite' | 'pro'>(
		threadDetail.data?.agentKind === 'pro' ? 'pro' : 'lite'
	);

	// THX-8: seed the timeline from server memory (400 messages ≈ 200 turns — beyond a sane thread).
	const history = createQuery(() => ({
		queryKey: ['mastra', 'thread-messages', threadIdProp],
		enabled: isExistingThread && clerkLoaded && Boolean(userId),
		queryFn: async () => {
			const thread = client.getMemoryThread({ threadId: threadId, agentId: ASTRA_AGENT_ID });
			const res = await thread.listMessages({ perPage: 400 });
			return mastraMessagesToTimeline(res.messages ?? []);
		}
	}));

	// Latch: hold first paint until the on-mount refetch settles (fresh data becomes the seed), then let
	// background refetches through without blocking (mirror the web `historySettled` guard).
	let historySettled = $state(untrack(() => !isExistingThread));
	$effect(() => {
		if (!history.isFetching && !historySettled) historySettled = true;
	});
	const loading = $derived(isExistingThread && !historySettled);

	// Create the durable agent once the seed is ready. Lifecycle is imperative (start/destroy) — a valid
	// external-source `$effect` (§3.4). The seed + initial tier are read via `untrack` so a later history
	// refetch / threadDetail load doesn't tear down and rebuild the agent mid-stream.
	let agent = $state<ThreadAgent | null>(null);
	$effect(() => {
		const tid = threadId;
		const uid = userId;
		if (!tid || !uid || !clerkLoaded || loading) return;
		const seed = untrack(() => history.data ?? []);
		const initialAgentKind = untrack(() => threadAgentKind);
		const a = new ThreadAgent({
			getClient: () => client,
			threadId: tid,
			getResourceId: () => (clerk.isLoaded ? clerk.auth.userId : null),
			queryClient: qc,
			initialAgentKind,
			seed
		});
		a.start();
		agent = a;
		return () => {
			a.destroy();
			agent = null;
		};
	});

	const sideOpen = $derived(isThreadPanelOpen(panel.mode));
</script>

{#if loading || !agent}
	<div class="flex h-svh flex-1 items-center justify-center gap-2 text-muted-foreground">
		<Spinner class="size-4" />
		<span class="text-sm">Memuat thread…</span>
	</div>
{:else}
	<!--
		Bounded-height root — restores web `ThreadShellLayout`'s wrapper (`h-svh min-h-0 overflow-hidden`).
		Every layer below (DetailSplitLayout provider, grid, inset, the surface `main`) is `min-h-svh`/`flex-1`
		with NO fixed height; without this fixed `h-svh` ancestor the chain is content-driven, so the surface's
		`overflow-y-auto` never engages (the body scrolls instead) and the landing hero's `flex-1 items-center
		justify-center` centers inside a content-tall region → the giant top gap. `ThreadDetailShell` merged
		web's `ThreadShellLayout` role but had dropped this div.
	-->
	<div class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
		<DetailSplitLayout
			{sideOpen}
			onSideOpenChange={(open) => {
				if (!open) panel.close();
			}}
		>
			{#snippet main()}
				<MastraChatThreadSurface
					agent={agent!}
					{threadId}
					{threadAgentKind}
					{compact}
					{initialContent}
				/>
			{/snippet}
			{#snippet side()}
				<DetailPanel controller={panel} />
			{/snippet}
		</DetailSplitLayout>
	</div>
{/if}
