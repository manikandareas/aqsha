<script lang="ts">
	import { untrack } from 'svelte';
	import { useClerkContext } from 'svelte-clerk';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { Spinner } from '$lib/components/ui/spinner';
	import { clerkTokenGetter } from '$lib/auth/token';
	import { useThread } from '$lib/features/threads/api';
	import { ASTRA_AGENT_ID, createMastraClient } from '$lib/features/threads/lib/mastra-client';
	import { mastraMessagesToTimeline } from '$lib/features/threads/lib/mastra-timeline';
	import { ThreadAgent } from '$lib/features/threads/state/thread-agent.svelte';
	import MastraChatThreadSurface from '$lib/features/thread-experience/components/MastraChatThreadSurface.svelte';

	/**
	 * Lean agent owner for the Explore/reader chat panel — creates the durable `ThreadAgent` + seeds the
	 * timeline (like `ThreadDetailShell`) but WITHOUT its own composer-mentions channel (the panel reuses
	 * the page-level shared instance so Explore "Tanya Astra" ambient refs reach this composer), WITHOUT a
	 * `ThreadPanelController` (a compact panel has no sub-panels), and WITHOUT a nested split layout.
	 * `bindUrlOnSend={false}`: first send must NOT overwrite the Explore `?q=&topic=` URL. The parent keys
	 * this component by thread id (remount = fresh agent) when the active thread changes.
	 */
	let { activeThreadId }: { activeThreadId: string | null } = $props();

	const clerk = useClerkContext();
	const qc = useQueryClient();
	const userId = $derived(clerk.auth.userId);
	const clerkLoaded = $derived(clerk.isLoaded);

	// A client-chosen id for a NEW thread (Mastra allows this). The parent keys this component by the
	// active thread id, so a new-thread session gets a fresh id per mount.
	const newThreadId = untrack(() =>
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `t-${Date.now()}`
	);
	const threadId = $derived(activeThreadId ?? newThreadId);
	const threadIdIsExisting = $derived(Boolean(activeThreadId));

	const client = createMastraClient(clerkTokenGetter(clerk));

	// Stored thread tier (only for an existing thread → no 404 on a fresh client id).
	const threadDetail = useThread(
		() => threadId,
		() => threadIdIsExisting && clerkLoaded && Boolean(userId)
	);
	const threadAgentKind = $derived<'lite' | 'pro'>(
		threadDetail.data?.agentKind === 'pro' ? 'pro' : 'lite'
	);

	// Seed the timeline from server memory (400 messages ≈ 200 turns).
	const history = createQuery(() => ({
		queryKey: ['mastra', 'thread-messages', threadIdIsExisting ? threadId : null],
		enabled: threadIdIsExisting && clerkLoaded && Boolean(userId),
		queryFn: async () => {
			const thread = client.getMemoryThread({ threadId, agentId: ASTRA_AGENT_ID });
			const res = await thread.listMessages({ perPage: 400 });
			return mastraMessagesToTimeline(res.messages ?? []);
		}
	}));

	// Hold first paint until the on-mount refetch settles (mirror the `historySettled` latch).
	let historySettled = $state(untrack(() => !threadIdIsExisting));
	$effect(() => {
		if (!history.isFetching && !historySettled) historySettled = true;
	});
	const loading = $derived(threadIdIsExisting && !historySettled);

	// Create the durable agent once the seed is ready (imperative lifecycle → valid $effect, §3.4).
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
</script>

{#if loading || !agent}
	<div class="flex flex-1 items-center justify-center gap-2 py-10 text-muted-foreground">
		<Spinner class="size-4" />
		<span class="text-sm">Memuat…</span>
	</div>
{:else}
	<MastraChatThreadSurface
		agent={agent!}
		{threadId}
		{threadAgentKind}
		compact
		bindUrlOnSend={false}
	/>
{/if}
