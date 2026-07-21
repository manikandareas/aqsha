<script lang="ts">
	import type { StatsGroup } from '@aqsha/chat-core/stats-viz';
	import { Icon, CheckIcon, CopyIcon, RotateCcwIcon } from '$lib/icons';
	import { Spinner } from '$lib/components/ui/spinner';
	import Response from '$lib/components/ai-elements/Response.svelte';
	import Shimmer from '$lib/components/ai-elements/Shimmer.svelte';
	import { buildCitationMap } from '../lib/citation-markdown';
	import { dedupeCards } from '../lib/source-card';
	import { messageSourceCards } from '../lib/thread-panel-data';
	import type { SourceCardData, TimelineMessage, TimelinePart } from '../lib/timeline-types';
	import type { ResearchSource } from '../types';
	import ProposalReviewCTA from '../../document/components/ProposalReviewCTA.svelte';
	import ChatArtifactCard from './ChatArtifactCard.svelte';
	import InlineSources from './InlineSources.svelte';
	import ProcessBlock from './ProcessBlock.svelte';
	import { getMessageInteractions } from './message-interactions';

	/**
	 * One assistant message (one turn): reasoning → "Proses" block (tool + intermediate text) → answer
	 * (LAST text part) → artifact → sources → actions. `message.streaming` (already busy-gated in the
	 * adapter) drives the shimmer + hides sources/actions while streaming.
	 */
	let {
		message,
		sources,
		statsGroupsByToolCallId,
		onRegenerate,
		turnStartedAt
	}: {
		message: TimelineMessage;
		sources?: ResearchSource[];
		statsGroupsByToolCallId?: Map<string, StatsGroup>;
		onRegenerate?: () => void;
		turnStartedAt?: number;
	} = $props();

	const interactions = getMessageInteractions();
	const streaming = $derived(Boolean(message.streaming));

	const texts = $derived(
		message.parts.filter((p): p is Extract<TimelinePart, { kind: 'text' }> => p.kind === 'text')
	);
	const answer = $derived(texts.at(-1));
	const answerId = $derived(answer?.id);

	const artifactParts = $derived(
		message.parts.filter(
			(p): p is Extract<TimelinePart, { kind: 'artifact' }> => p.kind === 'artifact'
		)
	);
	const proposalParts = $derived(
		message.parts.filter(
			(p): p is Extract<TimelinePart, { kind: 'document-proposal' }> =>
				p.kind === 'document-proposal'
		)
	);
	// Process = reasoning + tool + intermediate text (all texts except the final answer), original order.
	const processParts = $derived(
		message.parts.filter(
			(p) => p.kind === 'tool' || p.kind === 'reasoning' || (p.kind === 'text' && p.id !== answerId)
		)
	);
	// `/deep` report = has Workflow step rows (`wf:<stepId>`). Only these may render `aqsha:viz` figures.
	const isDeepReport = $derived(
		message.parts.some((p) => p.kind === 'tool' && p.model.toolCallId.startsWith('wf:'))
	);
	const toolSteps = $derived(processParts.filter((p) => p.kind === 'tool').length);

	// "Working" timer anchor: earliest running Workflow step start (durable across refresh); fallback the
	// triggering user message `createdAt`, then mount time in ElapsedLabel.
	const workingSince = $derived.by(() => {
		let earliest: number | undefined;
		for (const p of processParts) {
			if (p.kind !== 'tool' || !p.model.isRunning) continue;
			const startedAt = p.model.startedAt ?? 0;
			if (startedAt > 0 && (earliest === undefined || startedAt < earliest)) earliest = startedAt;
		}
		return earliest ?? turnStartedAt;
	});

	// `/deep` sources grouped by `subQuestionIndex` → search sub-agent cards (only sub-question-tagged).
	const sourcesBySubQ = $derived.by(() => {
		if (!sources || sources.length === 0) return undefined;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- derived grouping map, not reactive state
		const map = new Map<number, ResearchSource[]>();
		for (const s of sources) {
			if (s.subQuestionIndex == null) continue;
			const list = map.get(s.subQuestionIndex);
			if (list) list.push(s);
			else map.set(s.subQuestionIndex, [s]);
		}
		return map.size > 0 ? map : undefined;
	});

	// SINGLE source of truth for this message's source cards (shared with the panel).
	const citationCards = $derived<SourceCardData[]>(messageSourceCards(message, sources));
	const panelSources = $derived(dedupeCards(citationCards));
	const citationMap = $derived(buildCitationMap(citationCards));

	// Stats groups belonging to THIS message (filtered from the thread map by this message's tool parts,
	// keyed by runKey for the `{{stats:<runKey>}}` marker lookup).
	const messageStatsGroups = $derived.by(() => {
		if (!statsGroupsByToolCallId || statsGroupsByToolCallId.size === 0) return undefined;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- derived lookup map, not reactive state
		const map = new Map<string, StatsGroup>();
		for (const p of message.parts) {
			if (p.kind !== 'tool') continue;
			const group = statsGroupsByToolCallId.get(p.model.toolCallId);
			if (group) map.set(group.runKey, group);
		}
		return map.size > 0 ? map : undefined;
	});

	const hasAnswer = $derived(Boolean(answer));
	const isEmpty = $derived(message.parts.length === 0);

	let copied = $state(false);
	function copy(text: string): void {
		void navigator.clipboard?.writeText(text);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

{#snippet thinkingRow(label: string)}
	<span class="mt-1.5 flex items-center gap-1.5">
		<Spinner class="size-3.5 shrink-0 text-primary" />
		<Shimmer as="span" class="text-[13px]" text={label} />
	</span>
{/snippet}

<!-- `data-message-id` = scroll-to anchor for the Statistik panel's "Lihat di percakapan". -->
<div data-message-id={message.id} class="flex min-w-0 flex-col gap-2.5">
	{#if processParts.length > 0}
		<ProcessBlock
			parts={processParts}
			{streaming}
			{toolSteps}
			{sourcesBySubQ}
			{statsGroupsByToolCallId}
			turnId={message.turnId}
			{workingSince}
		/>
	{/if}

	{#if answer}
		<Response
			text={answer.text}
			streaming={answer.streaming}
			citations={citationMap}
			viz={isDeepReport}
			statsGroups={messageStatsGroups}
		/>
	{/if}

	{#each proposalParts as part (part.id)}
		<ProposalReviewCTA proposalId={part.model.proposalId} summary={part.model.summary} />
	{/each}

	{#each artifactParts as part (part.id)}
		<ChatArtifactCard model={part.model} />
	{/each}

	{#if !streaming && panelSources.length > 0}
		<InlineSources
			sources={panelSources}
			onOpen={interactions.openSources ? () => interactions.openSources?.(message.id) : undefined}
		/>
	{/if}

	{#if hasAnswer && !streaming}
		{@const answerText = answer?.text ?? ''}
		{#if answerText.trim() || onRegenerate}
			<div class="-ml-1.5 flex items-center gap-0.5 pt-0.5">
				{#if answerText.trim()}
					<button
						type="button"
						onclick={() => copy(answerText)}
						class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
						title="Salin jawaban"
						aria-label="Salin jawaban"
					>
						<Icon icon={copied ? CheckIcon : CopyIcon} class="size-3.5" />
					</button>
				{/if}
				{#if onRegenerate}
					<button
						type="button"
						onclick={onRegenerate}
						class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
						title="Ulangi jawaban"
						aria-label="Ulangi jawaban"
					>
						<Icon icon={RotateCcwIcon} class="size-3.5" />
					</button>
				{/if}
			</div>
		{/if}
	{/if}

	{#if streaming && isEmpty}
		{@render thinkingRow('Astra sedang berpikir…')}
	{:else if streaming && !hasAnswer}
		{@render thinkingRow('Astra sedang menyusun jawaban…')}
	{/if}
</div>
