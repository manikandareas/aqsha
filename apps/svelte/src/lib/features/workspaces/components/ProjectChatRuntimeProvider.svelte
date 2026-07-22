<script lang="ts">
	import { onDestroy, untrack, type Snippet } from 'svelte';
	import { SvelteURL, SvelteURLSearchParams } from 'svelte/reactivity';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import type { ContextRef } from '@aqsha/chat-core';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { useClerkContext } from 'svelte-clerk';
	import { clerkTokenGetter } from '$lib/auth/token';
	import { useThread } from '$lib/features/threads/api';
	import { ASTRA_AGENT_ID, createMastraClient } from '$lib/features/threads/lib/mastra-client';
	import { mastraMessagesToTimeline } from '$lib/features/threads/lib/mastra-timeline';
	import type { ThreadAgent } from '$lib/features/threads/state/thread-agent.svelte';
	import { ProjectChatSession } from '../lib/project-chat-session.svelte';
	import {
		setProjectChatRuntime,
		type ProjectChatRuntime
	} from './project-chat-runtime-context.svelte';

	let {
		workspaceId,
		onTurnSent,
		onAgentSettled,
		children
	}: {
		workspaceId: string;
		onTurnSent?: (threadId: string, sentContextRefs: ContextRef[]) => void;
		onAgentSettled?: (threadId: string) => void;
		children: Snippet;
	} = $props();

	const clerk = useClerkContext();
	const qc = useQueryClient();
	const userId = $derived(clerk.auth.userId);
	const clerkLoaded = $derived(clerk.isLoaded);
	const client = createMastraClient(clerkTokenGetter(clerk));

	function freshThreadId(): string {
		return typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `t-${Date.now()}`;
	}

	const initialThreadId = page.url.searchParams.get('thread')?.trim() || null;
	const session = new ProjectChatSession(initialThreadId, freshThreadId);
	const threadId = $derived(session.threadId);
	const restoreThreadId = $derived(session.restoreThreadId);

	const threadDetail = useThread(
		() => restoreThreadId ?? '',
		() => restoreThreadId !== null && clerkLoaded && Boolean(userId)
	);
	const threadAgentKind = $derived<'lite' | 'pro'>(
		threadDetail.data?.agentKind === 'pro' ? 'pro' : 'lite'
	);

	// Key terpisah dari ThreadDetailShell (`['mastra','thread-messages',id]` → shape
	// `{messages,oldestCursor,hasOlder}`). Berbagi key + staleTime 30s membuat restore panel
	// membaca cache tanpa `threadId` lalu gagal `history.data?.threadId === restoreId` selamanya.
	const history = createQuery(() => ({
		queryKey: ['mastra', 'project-chat-messages', restoreThreadId],
		enabled: restoreThreadId !== null && clerkLoaded && Boolean(userId),
		queryFn: async () => {
			const requestedThreadId = restoreThreadId;
			if (!requestedThreadId) throw new Error('Thread restore tidak tersedia.');
			const thread = client.getMemoryThread({
				threadId: requestedThreadId,
				agentId: ASTRA_AGENT_ID
			});
			const response = await thread.listMessages({ perPage: 400 });
			return {
				threadId: requestedThreadId,
				messages: mastraMessagesToTimeline(response.messages ?? [])
			};
		}
	}));

	function bindThreadToUrl(nextThreadId: string | null): void {
		// Same-page search-param patch — resolve() can't model an edited query string.
		const url = new SvelteURL(page.url);
		const search = new SvelteURLSearchParams(url.searchParams);
		if (nextThreadId) search.set('thread', nextThreadId);
		else search.delete('thread');
		url.search = search.toString();
		replaceState(url, page.state);
	}

	function promoteThread(promotedThreadId: string): void {
		if (!session.promote(promotedThreadId)) return;
		bindThreadToUrl(promotedThreadId);
	}

	function selectThread(selectedThreadId: string): void {
		if (!session.select(selectedThreadId)) return;
		bindThreadToUrl(selectedThreadId);
	}

	function startNewThread(): void {
		session.startNew();
		bindThreadToUrl(null);
	}

	function handleSettled(settledThreadId: string): void {
		if (threadId !== settledThreadId) return;
		// Promote only on accept. Settle advances accepted → ready, or no-ops on draft failure.
		session.markReady();
		onAgentSettled?.(settledThreadId);
	}

	let agent = $state<ThreadAgent | null>(null);
	let agentKey: string | null = null;

	function disposeAgent(): void {
		const current = agent;
		agentKey = null;
		agent = null;
		current?.destroy();
	}

	// Advance restoring → ready/failed once history + thread detail both settle.
	// Gate on `isFetched` (bukan truthy `data`): query disabled saat Clerk cold-load
	// melaporkan `isFetching===false`; `threadDetail.data === null` (404 lembut) juga jangan
	// menahan restore selamanya — paritas latch di ThreadDetailShell.
	$effect(() => {
		if (session.phase.kind !== 'restoring') return;
		const restoreId = session.phase.threadId;
		void clerkLoaded;
		void userId;
		if (history.isError || threadDetail.isError) {
			session.markRestoreFailed();
			return;
		}
		if (!history.isFetched || !threadDetail.isFetched) return;
		if (history.data?.threadId !== restoreId) return;
		session.markRestored();
	});

	$effect(() => {
		const canRun = session.canRunAgent;
		const identity = session.agentIdentityKey;
		if (!canRun) {
			disposeAgent();
			return;
		}
		// Keep the live agent across Clerk revalidate flicker.
		if (!clerkLoaded) return;

		const uid = userId;
		if (!uid) {
			disposeAgent();
			return;
		}

		const tid = untrack(() => session.threadId);
		const nextAgentKey = `${uid}:${identity}`;
		if (agentKey === nextAgentKey) return;
		const seed = untrack(() => (history.data?.threadId === tid ? history.data.messages : []));
		const initialAgentKind = untrack(() => threadAgentKind);
		disposeAgent();
		let cancelled = false;
		void import('$lib/features/threads/state/thread-agent.svelte').then(
			({ ThreadAgent: Agent }) => {
				if (cancelled) return;
				const nextAgent = new Agent({
					getClient: () => client,
					threadId: tid,
					getResourceId: () => (clerk.isLoaded ? clerk.auth.userId : null),
					getWorkspaceId: () => workspaceId,
					queryClient: qc,
					initialAgentKind,
					seed,
					onAccepted: () => promoteThread(tid),
					onSettled: () => handleSettled(tid)
				});
				nextAgent.start();
				agentKey = nextAgentKey;
				agent = nextAgent;
			}
		);
		return () => {
			cancelled = true;
		};
	});
	onDestroy(disposeAgent);

	const runtime: ProjectChatRuntime = {
		get workspaceId() {
			return workspaceId;
		},
		get phase() {
			return session.phase;
		},
		get activeThreadId() {
			return session.activeThreadId;
		},
		get threadId() {
			return threadId;
		},
		get threadAgentKind() {
			return threadAgentKind;
		},
		get agent() {
			return agent;
		},
		get threadPersisted() {
			return session.threadPersisted;
		},
		selectThread,
		startNewThread,
		retryRestore() {
			if (!session.retryRestore()) return;
			void history.refetch();
			void threadDetail.refetch();
		},
		onTurnSent(threadId, sentContextRefs) {
			onTurnSent?.(threadId, sentContextRefs);
		}
	};
	setProjectChatRuntime(runtime);
</script>

{@render children()}
