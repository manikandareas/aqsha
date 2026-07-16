<script lang="ts">
	import { untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useQueryClient } from '@tanstack/svelte-query';
	import { toast } from 'svelte-sonner';
	import type { StatsGroup } from '@aqsha/chat-core/stats-viz';
	import {
		Icon,
		AlertCircleIcon,
		ClockIcon,
		NotebookIcon,
		RotateCcwIcon,
		WrenchIcon,
		XIcon
	} from '$lib/icons';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import {
		Conversation,
		ConversationContent,
		ConversationScrollButton
	} from '$lib/components/ai-elements';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { queryKeys } from '$lib/query';
	import { threadTranscriptColumnClass } from '$lib/components/layout/panel-surface';
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
	import MessageList from '$lib/features/threads/components/MessageList.svelte';
	import QuestionsCard from '$lib/features/threads/components/QuestionsCard.svelte';
	import ToolCard, { toolCardShellClass } from '$lib/features/threads/components/ToolCard.svelte';
	import { bucketMessageAttachments } from '$lib/features/threads/lib/attachment-buckets';
	import { buildThreadPanelLookups } from '$lib/features/threads/lib/thread-panel-data';
	import { wfStepLabel } from '$lib/features/threads/lib/mastra-timeline';
	import { setMessageInteractions } from '$lib/features/threads/components/message-interactions';
	import type { ThreadAgent } from '$lib/features/threads/state/thread-agent.svelte';
	import type { ResearchSource } from '$lib/features/threads/types';
	import { getThreadPanel } from './thread-panel-context.svelte';
	import { LIVE_PLAN_KEY } from '../utils/thread-panel-model';
	import { blockedNotice, deepBlockedMessage } from '../utils/send-status';
	import ComposerHeroState from './ComposerHeroState.svelte';
	import HomeBannerCarousel from '$lib/components/HomeBannerCarousel.svelte';
	import HomeExploreBento from '$lib/features/discovery/components/HomeExploreBento.svelte';
	import ExploreHandwrittenCue from '$lib/features/discovery/components/ExploreHandwrittenCue.svelte';

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
		bindUrlOnSend = true
	}: {
		agent: ThreadAgent;
		threadId: string;
		threadAgentKind?: 'lite' | 'pro';
		compact?: boolean;
		initialContent?: string;
		/**
		 * Whether the first send of a NEW thread soft-bumps the URL to /app/threads/<id> (default). The
		 * Explore/reader chat panel passes `false`: it owns the thread lifecycle inside the panel and must
		 * NOT overwrite the page URL (which carries the Explore `?q=&topic=` state).
		 */
		bindUrlOnSend?: boolean;
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
	const reduce = $derived(prefersReducedMotion.current);
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

	// First send of a NEW thread → bump the URL to /app/threads/<id> (shallow, no navigation) so a
	// refresh resumes the thread. A new-thread landing has no `?panel=` yet (panels need messages), so a
	// bare resolve() path is sufficient — no query to preserve on the very first send.
	let bound = untrack(() => page.url.pathname.includes('/threads/'));
	function bumpUrl(): void {
		if (!bindUrlOnSend || bound) return;
		bound = true;
		replaceState(resolve('/app/(product)/threads/[threadId]', { threadId }), page.state);
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
		const opts = {
			clientContext: payload.clientContext,
			richText: payload.richText,
			attachmentIds: payload.attachmentIds,
			agentKind: payload.agentKind
		};
		const run =
			payload.command === 'deep'
				? agent.sendDeep(payload.text, opts)
				: agent.send(payload.text, opts);
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

{#snippet deepNoticeCard(
	body: string,
	detail: string | null | undefined,
	primary: { label: string; onClick: () => void; disabled?: boolean; stop?: boolean },
	secondary?: { label: string; onClick: () => void }
)}
	<div
		class={threadTranscriptColumnClass}
		transition:slide={reduce ? { duration: 0 } : { duration: 180 }}
	>
		<div class={toolCardShellClass}>
			<div class="flex gap-2">
				<Icon icon={AlertCircleIcon} class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				<div class="min-w-0 flex-1">
					<p class="text-sm text-foreground">{body}</p>
					{#if detail}<p class="mt-1 text-xs text-muted-foreground">{detail}</p>{/if}
				</div>
			</div>
			<div class="mt-3 flex gap-2 pl-6">
				<Button size="sm" onclick={primary.onClick} disabled={primary.disabled}>
					{#if !primary.stop}<Icon icon={RotateCcwIcon} class="size-3.5" />{/if}
					{primary.label}
				</Button>
				{#if secondary}
					<Button size="sm" variant="ghost" onclick={secondary.onClick}>{secondary.label}</Button>
				{/if}
			</div>
		</div>
	</div>
{/snippet}

{#snippet composerDock(showSuggestions: boolean)}
	<Composer
		onSend={onComposerSend}
		onStop={() => agent.stop()}
		{busy}
		disabled={blocked}
		{notice}
		{threadId}
		{threadAgentKind}
		{errorDraft}
		{showSuggestions}
		recentThreads={showSuggestions ? recentThreads.data : []}
		initialContent={showSuggestions ? initialContent : undefined}
	/>
{/snippet}

{#if isEmpty}
	<main
		class="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-background"
	>
		<div
			class={cn(
				'relative mx-auto flex w-full flex-col',
				compact
					? 'max-w-none flex-1 px-5 pt-3 pb-8 @2xl:px-6'
					: 'min-h-full max-w-5xl shrink-0 px-4 pt-10 pb-5 @2xl:px-8'
			)}
		>
			<div class="flex w-full flex-1 items-center justify-center">
				<div class={cn('w-full', compact ? 'max-w-none' : 'max-w-3xl')}>
					<ComposerHeroState
						headerClass="mb-5 gap-2"
						logoClass={compact ? 'size-12 @2xl:size-18' : 'size-12 @2xl:size-22'}
						titleClass={cn(
							'font-sans leading-none font-bold tracking-tight text-foreground',
							compact ? 'text-xl' : 'text-3xl @2xl:text-4xl'
						)}
					>
						{@render composerDock(!compact)}
					</ComposerHeroState>
				</div>
			</div>
			{#if !compact}
				<div class="mx-auto w-full max-w-xl">
					<HomeBannerCarousel />
				</div>
				<!-- Cue positioned absolute vs the landing column — top-right, diagonal between the open-panel
				     action and the hero title. -->
				<ExploreHandwrittenCue />
			{/if}
		</div>
		{#if !compact}
			<HomeExploreBento />
		{/if}
	</main>
{:else}
	<div class="flex h-full min-h-0 w-full flex-col">
		<Conversation class="flex-1">
			<ConversationContent class="max-w-none p-0">
				<div class={cn(threadTranscriptColumnClass, 'flex flex-col gap-4 pt-3 pb-8')}>
					<MessageList
						messages={agent.messages}
						pending={agent.status === 'submitted'}
						{busy}
						{sourcesByTurn}
						{statsGroupsByToolCallId}
						{attachmentsByMessage}
						onRegenerate={() => void agent.regenerate()}
					/>
					{#if agent.error}
						<p class="text-sm text-red-500">{agent.error}</p>
					{/if}
				</div>
			</ConversationContent>
			{#snippet overlay()}
				<ConversationScrollButton />
			{/snippet}
		</Conversation>
		<div class={cn(threadTranscriptColumnClass, 'flex flex-col gap-2.5 pt-2.5 pb-4')}>
			{#if agent.deepStalled}
				{@render deepNoticeCard(
					agent.deepStalled,
					null,
					{ label: 'Mulai ulang', onClick: () => void agent.restartDeep() },
					{ label: 'Hentikan', onClick: () => agent.stop() }
				)}
			{/if}
			{#if agent.deepFailed}
				{@render deepNoticeCard(
					`Riset mendalam gagal${agent.deepFailed.stepId ? ` pada langkah "${wfStepLabel(agent.deepFailed.stepId).toLowerCase()}"` : ''}. Coba lagi akan melanjutkan dari langkah itu tanpa memotong kredit baru.`,
					agent.deepFailed.message,
					{ label: 'Coba lagi', onClick: () => void agent.retryDeep(), disabled: busy },
					{ label: 'Buang', onClick: () => agent.dismissDeepFailure() }
				)}
			{/if}
			{#if agent.deepNotice && !agent.messages.some((m) => m.id === `deep-bail:${agent.deepNotice!.runId}`)}
				{@render deepNoticeCard(`Riset mendalam dihentikan: ${agent.deepNotice.reason}`, null, {
					label: 'Tutup',
					onClick: () => agent.dismissDeepNotice(),
					stop: true
				})}
			{/if}
			{#if agent.askGate}
				<div
					class={threadTranscriptColumnClass}
					transition:slide={reduce ? { duration: 0 } : { duration: 180 }}
				>
					<QuestionsCard
						questions={agent.askGate.questions}
						findings={agent.askGate.findings}
						onSubmit={(resume) => void agent.resolveAsk(resume)}
						onSkip={() => void agent.resolveAsk({ action: 'skipped' })}
						onOpenPanel={panel ? () => panel.openQuestionsPanel() : undefined}
					/>
				</div>
			{/if}
			{#if agent.planGate}
				<div
					class={threadTranscriptColumnClass}
					transition:slide={reduce ? { duration: 0 } : { duration: 180 }}
				>
					<ToolCard
						icon={NotebookIcon}
						title="Rencana riset"
						meta={`${agent.planGate.subQuestions.length} sub-pertanyaan`}
						onOpenPanel={panel ? () => panel.openPlanPanel(LIVE_PLAN_KEY) : undefined}
					>
						<div class="flex gap-2">
							<Button size="sm" onclick={() => void agent.resolvePlan(true)}>Setujui</Button>
							<Button size="sm" variant="ghost" onclick={() => void agent.resolvePlan(false)}>
								Tolak
							</Button>
						</div>
					</ToolCard>
				</div>
			{/if}
			{#if agent.approvals.length > 0}
				<div
					class={cn(threadTranscriptColumnClass, 'flex flex-col gap-2.5')}
					transition:slide={reduce ? { duration: 0 } : { duration: 180 }}
				>
					{#each agent.approvals as a (a.toolCallId)}
						<ToolCard
							icon={WrenchIcon}
							title={a.title}
							meta={typeof a.args.artifactId === 'string' ? a.args.artifactId : undefined}
						>
							<div class="flex gap-2">
								<Button size="sm" onclick={() => void agent.approve(a.toolCallId)}>Setujui</Button>
								<Button size="sm" variant="ghost" onclick={() => void agent.decline(a.toolCallId)}>
									Tolak
								</Button>
							</div>
						</ToolCard>
					{/each}
				</div>
			{/if}
			{#if agent.queued.length > 0}
				<div
					class={cn(threadTranscriptColumnClass, 'flex flex-col gap-1.5')}
					transition:slide={reduce ? { duration: 0 } : { duration: 180 }}
				>
					{#each agent.queued as q (q.id)}
						<div
							class="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[13px]"
						>
							<Icon icon={ClockIcon} class="size-3.5 shrink-0 text-muted-foreground/70" />
							<span class="min-w-0 flex-1 truncate text-foreground/80">{q.text}</span>
							<span class="shrink-0 text-[11px] text-muted-foreground">
								{q.mode === 'deep' ? 'Antre · /deep' : q.serverRunId ? 'Antre di server' : 'Antre'}
							</span>
							{#if q.serverRunId === undefined}
								<button
									type="button"
									onclick={() => agent.cancelQueued(q.id)}
									aria-label="Batalkan antrean"
									class="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
								>
									<Icon icon={XIcon} class="size-3.5" />
								</button>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
			{@render composerDock(false)}
		</div>
	</div>
{/if}
