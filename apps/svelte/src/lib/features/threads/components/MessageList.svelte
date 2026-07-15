<script lang="ts">
	import type { StatsGroup } from '@aqsha/chat-core/stats-viz';
	import { Icon, SparklesIcon } from '$lib/icons';
	import { Spinner } from '$lib/components/ui/spinner';
	import Shimmer from '$lib/components/ai-elements/Shimmer.svelte';
	import type { MessageAttachment } from '../lib/attachment-buckets';
	import type { TimelineMessage } from '../lib/timeline-types';
	import type { ResearchSource } from '../types';
	import AssistantMessage from './AssistantMessage.svelte';
	import UserBubble from './UserBubble.svelte';
	import NextStepChips from './stats-viz/NextStepChips.svelte';

	/**
	 * Message timeline — FLAT per-message render following `defaultMessageReducer` order. User = bubble;
	 * assistant = reasoning → "Proses" block → answer → artifact → inline sources → actions. HITL cards
	 * awaiting an answer render above the composer (in the shell), not here.
	 */
	let {
		messages,
		pending = false,
		busy = false,
		sourcesByTurn,
		statsGroupsByToolCallId,
		attachmentsByMessage,
		onRegenerate
	}: {
		messages: TimelineMessage[];
		pending?: boolean;
		busy?: boolean;
		sourcesByTurn?: Map<string, ResearchSource[]>;
		statsGroupsByToolCallId?: Map<string, StatsGroup>;
		attachmentsByMessage?: Map<string, MessageAttachment[]>;
		onRegenerate?: () => void;
	} = $props();

	const last = $derived(messages.at(-1));
	// Standalone "typing" indicator only when no assistant message exists yet (user just sent).
	const showTyping = $derived(Boolean(pending) && (!last || last.role === 'user'));
	const lastAssistantId = $derived([...messages].reverse().find((m) => m.role === 'assistant')?.id);

	/** Analysis id of the LAST successful run within one assistant message (next-step chips). */
	function lastSuccessfulAnalysisId(message: TimelineMessage): string | undefined {
		let found: string | undefined;
		for (const p of message.parts) {
			if (p.kind !== 'tool') continue;
			const detail = p.model.detail;
			if (detail?.kind === 'analysis' && p.model.status === 'completed' && !detail.failed) {
				found = detail.analysis;
			}
		}
		return found;
	}

	/** `createdAt` of the nearest user message BEFORE index `i` — durable turn timer anchor. */
	function precedingUserCreatedAt(i: number): number | undefined {
		for (let j = i - 1; j >= 0; j--) {
			const m = messages[j];
			if (m?.role === 'user') return m.createdAt > 0 ? m.createdAt : undefined;
		}
		return undefined;
	}

	// Next-step chip ritual: only the LAST analysis run of the thread + settled turn.
	const nextStepAnalysis = $derived(
		!busy && last?.role === 'assistant' ? lastSuccessfulAnalysisId(last) : undefined
	);
</script>

{#if messages.length === 0 && !pending}
	<div class="flex flex-1 flex-col items-center justify-center gap-2 text-center">
		<Icon icon={SparklesIcon} class="size-6 text-muted-foreground" />
		<p class="text-sm text-muted-foreground">Mulai percakapan dengan Astra.</p>
	</div>
{:else}
	<div class="flex flex-col gap-6">
		{#each messages as m, i (m.id)}
			{#if m.role === 'user'}
				<UserBubble parts={m.parts} attachments={attachmentsByMessage?.get(m.id)} />
			{:else}
				<AssistantMessage
					message={m}
					sources={m.turnId ? sourcesByTurn?.get(m.turnId) : undefined}
					{statsGroupsByToolCallId}
					onRegenerate={!busy && m.id === lastAssistantId ? onRegenerate : undefined}
					turnStartedAt={precedingUserCreatedAt(i)}
				/>
			{/if}
		{/each}
		{#if showTyping}
			<span class="mt-1.5 flex items-center gap-1.5">
				<Spinner class="size-3.5 shrink-0 text-primary" />
				<Shimmer as="span" class="text-[13px]" text="Astra sedang berpikir…" />
			</span>
		{/if}
		{#if nextStepAnalysis}
			<NextStepChips analysis={nextStepAnalysis} />
		{/if}
	</div>
{/if}
