<script lang="ts">
	import { untrack } from 'svelte';
	import { stripStatsMarkers, type StatsGroup } from '@aqsha/chat-core/stats-viz';
	import { Icon, ChevronDownIcon } from '$lib/icons';
	import * as Collapsible from '@aqsha/ui-svelte/components/collapsible';
	import { Spinner } from '$lib/components/ui/spinner';
	import Reasoning from '$lib/components/ai-elements/Reasoning.svelte';
	import type { TimelinePart } from '../lib/timeline-types';
	import type { ResearchSource } from '../types';
	import ElapsedLabel from './ElapsedLabel.svelte';
	import ToolRow from './ToolRow.svelte';

	/**
	 * Collapsible "Proses" block — tool-rows + intermediate reasoning/text of one message, in original
	 * order. Open + shimmer while streaming; on settle auto-collapses to "Selesai · N langkah" unless the
	 * user opened it manually.
	 */
	let {
		parts,
		streaming,
		toolSteps,
		sourcesBySubQ,
		statsGroupsByToolCallId,
		turnId,
		workingSince
	}: {
		parts: TimelinePart[];
		streaming: boolean;
		toolSteps: number;
		sourcesBySubQ?: Map<number, ResearchSource[]>;
		statsGroupsByToolCallId?: Map<string, StatsGroup>;
		turnId?: string;
		workingSince?: number;
	} = $props();

	// null = follow auto (open == streaming); boolean = sticky manual choice.
	let override = $state<boolean | null>(null);
	let prevStreaming = untrack(() => streaming);
	$effect(() => {
		if (prevStreaming && !streaming) override = override === true ? true : null;
		prevStreaming = streaming;
	});
	const open = $derived(override ?? streaming);
	const settledLabel = $derived(toolSteps > 0 ? `Selesai · ${toolSteps} langkah` : 'Proses');
</script>

<Collapsible.Root class="min-w-0" {open} onOpenChange={(next) => (override = next)}>
	<Collapsible.Trigger
		class="group -mx-1.5 flex w-full min-w-0 items-center gap-1.5 rounded-[8px] px-1.5 py-1 text-left text-[13px] transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	>
		{#if streaming}
			<Spinner class="size-3.5 shrink-0 text-primary" />
			<ElapsedLabel base="Sedang bekerja" startedAt={workingSince} />
		{:else}
			<span class="font-medium text-muted-foreground">{settledLabel}</span>
		{/if}
		<Icon
			icon={ChevronDownIcon}
			class="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
		/>
	</Collapsible.Trigger>
	<Collapsible.Content>
		<div class="mt-2 flex min-w-0 flex-col gap-2.5 text-[13px]">
			{#each parts as part (part.id)}
				{#if part.kind === 'tool'}
					<ToolRow
						model={part.model}
						{sourcesBySubQ}
						{turnId}
						statsGroup={statsGroupsByToolCallId?.get(part.model.toolCallId)}
					/>
				{:else if part.kind === 'reasoning'}
					<Reasoning text={part.text} isThinking={part.thinking} />
				{:else if part.kind === 'text'}
					<div class="break-words whitespace-pre-wrap text-muted-foreground">
						{stripStatsMarkers(part.text)}
					</div>
				{/if}
			{/each}
		</div>
	</Collapsible.Content>
</Collapsible.Root>
