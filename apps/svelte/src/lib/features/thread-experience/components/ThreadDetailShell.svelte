<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { useClerkContext } from 'svelte-clerk';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { buildWorkspaceMentionLabel } from '@aqsha/chat-core';
	import { Spinner } from '$lib/components/ui/spinner';
	import { PageTitle } from '$lib/seo';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import { clerkTokenGetter } from '$lib/auth/token';
	import { useThread } from '$lib/features/threads/api';
	import { threadPageTitle, threadTitle } from '$lib/features/threads/types';
	import { useRecentThreadSummaries } from '$lib/features/threads/use-recent-thread-summaries.svelte';
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
	import ThreadHeader from './ThreadHeader.svelte';

	/**
	 * Thread-detail shell — the one place that owns the durable agent + the side-panel slot. Creates the
	 * per-tree contexts (composer mentions, panel controller), seeds the timeline from server memory
	 * (400-message history), spins up the `ThreadAgent` lifecycle, and lays out the surface (main)
	 * beside the responsive DetailPanel (`DetailSplitLayout` = inline inset ≥1100px / drawer below).
	 */
	let {
		threadId: threadIdProp,
		compact = false,
		initialContent,
		workspace = null
	}: {
		threadId?: string;
		compact?: boolean;
		initialContent?: string;
		workspace?: { id: string; name: string } | null;
	} = $props();

	const clerk = useClerkContext();
	const qc = useQueryClient();
	// Left-nav sidebar (AppShell provider) — read at init, before DetailSplitLayout opens its own provider.
	const leftSidebar = Sidebar.useSidebar();
	const userId = $derived(clerk.auth.userId);
	const clerkLoaded = $derived(clerk.isLoaded);

	// Per-tree channels + panel controller — set once at init, never module singletons.
	const mentions = new ComposerMentions();
	setComposerMentions(mentions);
	const panel = new ThreadPanelController();
	setThreadPanel(panel);

	// Chip konteks proyek selalu terlihat di composer (channel ambient). Signature-guarded sync:
	// an unguarded epoch-bumping set inside this effect feeds the composer's ambient-merge effect
	// back into it and trips `effect_update_depth_exceeded`.
	$effect(() => {
		if (!workspace) return;
		mentions.syncAmbientFromPage([
			{
				kind: 'workspace',
				workspaceId: workspace.id,
				label: buildWorkspaceMentionLabel(workspace.name)
			}
		]);
	});

	// Stable client-side thread id for a NEW thread (Mastra allows a client-chosen id).
	const newThreadId = untrack(() =>
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `t-${Date.now()}`
	);
	const threadId = $derived(threadIdProp ?? newThreadId);
	const isExistingThread = $derived(Boolean(threadIdProp));

	// A thread's route lives under its project; the recent-thread switcher + first-send URL binder both
	// need this builder to navigate. `undefined` when there is no project → binding/switching is a no-op.
	const threadUrlFor = $derived.by(() => {
		const ws = workspace;
		if (!ws) return undefined;
		return (tid: string) =>
			resolve('/app/(product)/projects/[projectId]/threads/[threadId]', {
				projectId: ws.id,
				threadId: tid
			});
	});

	const client = createMastraClient(clerkTokenGetter(clerk));

	// Stored thread tier (read once, gated to an existing thread → no 404 for a new client id).
	const threadDetail = useThread(
		() => threadId,
		() => isExistingThread && clerkLoaded && Boolean(userId)
	);
	const threadAgentKind = $derived<'lite' | 'pro'>(
		threadDetail.data?.agentKind === 'pro' ? 'pro' : 'lite'
	);

	const recentThreads = useRecentThreadSummaries(
		() => isExistingThread && clerkLoaded && Boolean(userId),
		() => workspace?.id ?? null
	);
	const headerTitle = $derived(
		isExistingThread ? threadTitle(threadDetail.data ?? { title: null }) : 'Thread baru'
	);

	const pageTitle = $derived(threadPageTitle(threadDetail.data));

	// Seed the timeline from server memory (400 messages ≈ 200 turns — beyond a sane thread).
	const history = createQuery(() => ({
		queryKey: ['mastra', 'thread-messages', threadIdProp],
		enabled: isExistingThread && clerkLoaded && Boolean(userId),
		queryFn: async () => {
			const thread = client.getMemoryThread({ threadId: threadId, agentId: ASTRA_AGENT_ID });
			const res = await thread.listMessages({ perPage: 400 });
			return mastraMessagesToTimeline(res.messages ?? []);
		}
	}));

	// Latch: hold first paint until the history query has actually fetched (fresh data becomes the seed),
	// then let background refetches through without blocking. Gate on `isFetched`, NOT `!isFetching`: a
	// query disabled during Clerk cold-load reports `isFetching === false`, which would settle the latch
	// before the fetch runs → the agent seeds with empty `history.data` and the thread renders the empty
	// hero until a message is sent. `isFetched` stays false while disabled/pending, flipping true only
	// after the first fetch resolves (success or error).
	let historySettled = $state(untrack(() => !isExistingThread));
	$effect(() => {
		if (history.isFetched && !historySettled) historySettled = true;
	});
	const loading = $derived(isExistingThread && !historySettled);

	// Create the durable agent once the seed is ready. Lifecycle is imperative (start/destroy) — a valid
	// external-source `$effect`. The seed + initial tier are read via `untrack` so a later history refetch
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
			getWorkspaceId: () => workspace?.id ?? null,
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
	const isLeftSidebarOpen = $derived(
		leftSidebar.isMobile ? leftSidebar.openMobile : leftSidebar.open
	);
</script>

<PageTitle title={pageTitle} />

{#if loading || !agent}
	<div class="flex h-svh flex-1 items-center justify-center gap-2 text-muted-foreground">
		<Spinner class="size-4" />
		<span class="text-sm">Memuat thread…</span>
	</div>
{:else}
	<!--
		Bounded-height root (`h-svh min-h-0 overflow-hidden`). Every layer below (DetailSplitLayout
		provider, grid, inset, the surface `main`) is `min-h-svh`/`flex-1` with NO fixed height;
		without this fixed `h-svh` ancestor the chain is content-driven, so the surface's
		`overflow-y-auto` never engages (the body scrolls instead) and the landing hero's
		`flex-1 items-center justify-center` centers inside a content-tall region → giant top gap.
	-->
	<div class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
		<DetailSplitLayout
			{sideOpen}
			onSideOpenChange={(open) => {
				if (!open) panel.close();
			}}
		>
			{#snippet main()}
				<ThreadHeader
					threadId={threadIdProp}
					title={headerTitle}
					isExisting={isExistingThread}
					recentThreads={recentThreads.data}
					showLeftTrigger={!isLeftSidebarOpen}
					onToggleLeftSidebar={() => leftSidebar.toggle()}
					contextPanelOpen={sideOpen}
					onOpenContextPanel={() => panel.openContextPanel()}
					{threadUrlFor}
				/>
				<div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
					<MastraChatThreadSurface
						agent={agent!}
						{threadId}
						{threadAgentKind}
						{compact}
						{initialContent}
						ambientWorkspaceId={workspace?.id ?? null}
						{threadUrlFor}
					/>
				</div>
			{/snippet}
			{#snippet side()}
				<DetailPanel controller={panel} />
			{/snippet}
		</DetailSplitLayout>
	</div>
{/if}
