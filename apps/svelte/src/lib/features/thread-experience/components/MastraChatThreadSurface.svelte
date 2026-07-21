<script lang="ts">
	import { untrack } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { useQueryClient } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import type { StatsGroup } from '@aqsha/chat-core/stats-viz';
	import { queryKeys } from '$lib/query';
	import {
		useSendStatus,
		useThreadArtifacts,
		useThreadSources,
		useThreadStatsBlocks
	} from '$lib/features/threads/api';
	import {
		Composer,
		type ComposerNotice,
		type ComposerSendPayload
	} from '$lib/features/threads/components/composer';
	import { useRecentThreadSummaries } from '$lib/features/threads/use-recent-thread-summaries.svelte';
	import { bucketMessageAttachments } from '$lib/features/threads/lib/attachment-buckets';
	import { buildThreadPanelLookups } from '$lib/features/threads/lib/thread-panel-data';
	import { setMessageInteractions } from '$lib/features/threads/components/message-interactions';
	import type { ThreadHistoryControls } from '$lib/features/threads/lib/thread-history';
	import type { ThreadAgent } from '$lib/features/threads/state/thread-agent.svelte';
	import type { ResearchSource } from '$lib/features/threads/types';
	import { getThreadPanel } from './thread-panel-context.svelte';
	import { LIVE_PLAN_KEY } from '../utils/thread-panel-model';
	import { blockedNotice, deepBlockedMessage } from '../utils/send-status';
	import ThreadActiveSurface from './ThreadActiveSurface.svelte';
	import ThreadLandingSurface from './ThreadLandingSurface.svelte';

	/**
	 * Mastra chat runtime surface — the V1 composition (rich composer + landing hero) over `ThreadAgent`.
	 * Mastra Memory (server) = message SoT; the thread id is client-chosen so the URL is bumped on first
	 * send without waiting for a server round-trip.
	 */
	let {
		agent,
		threadId,
		threadAgentKind = 'lite',
		compact = false,
		initialContent,
		bindUrlOnSend = true,
		threadUrlFor,
		ambientWorkspaceId = null,
		getExtraClientContext,
		onTurnSent,
		history = null
	}: {
		agent: ThreadAgent;
		threadId: string;
		threadAgentKind?: 'lite' | 'pro';
		compact?: boolean;
		initialContent?: string;
		/**
		 * Whether the first send of a NEW thread soft-bumps the URL to the thread's own route (default).
		 * The Explore/reader chat panel passes `false`: it owns the thread lifecycle inside the panel and
		 * must NOT overwrite the page URL (which carries the Explore `?q=&topic=` state).
		 */
		bindUrlOnSend?: boolean;
		/**
		 * Builds the URL to bind on first send of a NEW thread. Required because a thread's route lives
		 * under its project, so the surface can't hardcode it. Without a builder, binding is a no-op.
		 */
		threadUrlFor?: (threadId: string) => string;
		/** Current project's workspace id — prioritized in the composer's @mention picker. */
		ambientWorkspaceId?: string | null;
		/** Konteks tambahan yang digabung ke tiap kirim (mis. antrian anotasi bab). */
		getExtraClientContext?: () => string[];
		/** Dipanggil segera setelah turn berangkat — antrian ikut turn ini, lepas dari hasil stream. */
		onTurnSent?: (threadId: string) => void;
		/** Older-history pager owned by the shell; null when the surface has no persisted timeline. */
		history?: ThreadHistoryControls | null;
	} = $props();

	const qc = useQueryClient();
	const panel = getThreadPanel();

	// Bridge the panel controller's openers to in-message cards (MessageInteractions).
	setMessageInteractions(
		panel
			? {
					openArtifact: (id) => panel.openArtifactPanel(id),
					openSources: (id) => panel.openSourcesPanel(id),
					openSearch: (turnId, idx) => panel.openSearchPanel(turnId, idx),
					openStep: (id) => panel.openStepPanel(id),
					openPlan: (turnId) => panel.openPlanPanel(turnId),
					openStats: (runKey) => panel.openStatsPanel(runKey)
				}
			: {}
	);

	const hasMessages = () => agent.messages.length > 0;
	const sendStatus = useSendStatus('normal_chat');
	// FE-11: `/deep` pre-check (non-consuming) — checked on submit so cap-exhaustion surfaces before the run.
	const deepSendStatus = useSendStatus('deep_research');

	const busy = $derived(agent.status !== 'ready');
	const notice = $derived<ComposerNotice | null>(blockedNotice(sendStatus.data));
	const blocked = $derived(notice !== null);
	const isEmpty = $derived(agent.messages.length === 0 && !busy);

	// Research sources → grouped per turn (runId). Fetch once the thread has messages.
	const sources = useThreadSources(() => threadId, hasMessages);
	const sourcesByTurn = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- derived lookup map, not reactive state
		const map = new Map<string, ResearchSource[]>();
		for (const s of sources.data ?? []) {
			if (s.citationNumber == null) continue;
			const list = map.get(s.turnId);
			if (list) list.push(s);
			else map.set(s.turnId, [s]);
		}
		return map;
	});

	const statsBlocks = useThreadStatsBlocks(() => threadId, hasMessages);
	const statsGroupsByToolCallId = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- derived lookup map, not reactive state
		const map = new Map<string, StatsGroup>();
		for (const g of statsBlocks.data ?? []) map.set(g.toolCallId, g.group);
		return map;
	});

	const threadArtifacts = useThreadArtifacts(() => (hasMessages() ? threadId : null), {
		pollWhilePending: true
	});
	const attachmentsByMessage = $derived(
		bucketMessageAttachments(agent.messages, threadArtifacts.data)
	);

	// Id-keyed detail lookups for the side panels — built here + published to the controller. While a
	// plan/ask gate is live, inject its Setujui/Tolak / resolve-skip so the panel matches the gate card.
	$effect(() => {
		if (!panel) return;
		const lookups = buildThreadPanelLookups(
			agent.messages,
			sources.data,
			agent.planGate,
			agent.askGate,
			statsBlocks.data
		);
		const livePlan = agent.planGate ? lookups.plans.get(LIVE_PLAN_KEY) : undefined;
		if (livePlan) {
			lookups.plans.set(LIVE_PLAN_KEY, {
				...livePlan,
				resolve: (approve: boolean) => void agent.resolvePlan(approve)
			});
		}
		if (lookups.ask) {
			lookups.ask = {
				...lookups.ask,
				resolve: (resume) => void agent.resolveAsk(resume),
				skip: () => void agent.resolveAsk({ action: 'skipped' })
			};
		}
		panel.register(lookups);
	});

	// First send of a NEW thread → bump the URL to the thread's own route (shallow, no navigation) so a
	// refresh resumes the thread. Needs an explicit `threadUrlFor` builder because the route lives under
	// its project; without one, binding is a no-op. A new-thread landing has no `?panel=` yet (panels
	// need messages), so the built path is sufficient — no query to preserve on the very first send.
	let bound = untrack(() => page.url.pathname.includes('/threads/'));
	function bumpUrl(): void {
		if (!bindUrlOnSend || bound || !threadUrlFor) return;
		bound = true;
		replaceState(threadUrlFor(threadId), page.state);
	}

	function onComposerSend(payload: ComposerSendPayload): void {
		if (payload.command === 'deep') {
			const st = deepSendStatus.data;
			if (st && !st.canSend) {
				toast.error(deepBlockedMessage(st));
				return;
			}
		}
		bumpUrl();
		// Merge extra context BEFORE enqueue so a queued-while-busy turn still carries it.
		const extra = getExtraClientContext?.() ?? [];
		const mergedContext = [...(payload.clientContext ?? []), ...extra];
		const opts = {
			clientContext: mergedContext.length > 0 ? mergedContext : undefined,
			richText: payload.richText,
			attachmentIds: payload.attachmentIds,
			agentKind: payload.agentKind
		};
		const run =
			payload.command === 'deep'
				? agent.sendDeep(payload.text, opts)
				: agent.send(payload.text, opts);
		// Fired immediately: the queue rides this turn; stream success/failure doesn't change "sent".
		onTurnSent?.(threadId);
		void run.then(() => {
			void qc.invalidateQueries({ queryKey: queryKeys.threads.sendStatus('normal_chat') });
			void qc.invalidateQueries({ queryKey: queryKeys.threads.sendStatus('deep_research') });
		});
	}

	const recentThreads = useRecentThreadSummaries(() => isEmpty && !compact);

	const errorDraft = $derived(agent.error ? lastUserText() : null);
	function lastUserText(): string | null {
		const msgs = agent.messages;
		for (let i = msgs.length - 1; i >= 0; i--) {
			const msg = msgs[i];
			if (msg?.role !== 'user') continue;
			const t = msg.parts
				.filter((p) => p.kind === 'text')
				.map((p) => (p.kind === 'text' ? p.text : ''))
				.join('\n')
				.trim();
			return t || null;
		}
		return null;
	}
</script>

{#if isEmpty}
	<ThreadLandingSurface {compact}>
		{#snippet composer()}
			<Composer
				onSend={onComposerSend}
				onStop={() => agent.stop()}
				{busy}
				disabled={blocked}
				{notice}
				{threadId}
				{threadAgentKind}
				{ambientWorkspaceId}
				{errorDraft}
				showSuggestions={!compact}
				showLandingSuggestions={compact}
				recentThreads={recentThreads.data}
				{initialContent}
			/>
		{/snippet}
	</ThreadLandingSurface>
{:else}
	<ThreadActiveSurface
		{agent}
		panel={panel ?? null}
		{sourcesByTurn}
		{statsGroupsByToolCallId}
		{attachmentsByMessage}
		{busy}
		{blocked}
		{notice}
		{threadId}
		{threadAgentKind}
		{errorDraft}
		{onComposerSend}
		{history}
	/>
{/if}
