<script lang="ts">
	import { untrack } from 'svelte';
	import { messagePreview } from '@aqsha/chat-core';
	import type { StatsGroup } from '@aqsha/chat-core/stats-viz';
	import { Icon, ChevronDownIcon, TelescopeIcon, XCircleIcon } from '$lib/icons';
	import { Badge } from '$lib/components/ui/badge';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { Spinner } from '$lib/components/ui/spinner';
	import Shimmer from '$lib/components/ai-elements/Shimmer.svelte';
	import { cn } from '$lib/utils';
	import { STATS_SANDBOX_TOOLS } from '../lib/stats-run-detail';
	import type { ToolRowModel } from '../lib/timeline-types';
	import type { ResearchSource } from '../types';
	import DeepSearchCards from './DeepSearchCards.svelte';
	import SourceCardList from './SourceCardList.svelte';
	import ElapsedLabel from './ElapsedLabel.svelte';
	import ScrollDetailTrigger from './ScrollDetailTrigger.svelte';
	import { getMessageInteractions } from './message-interactions';
	import { toolGlyph } from './tool-glyph';
	import AnalysisRunCard from './stats-viz/AnalysisRunCard.svelte';
	import DatasetProfileCard from './stats-viz/DatasetProfileCard.svelte';

	/**
	 * One tool call as a collapsible row (port of `tool-row.tsx`). Collapsed: status icon + title
	 * (Shimmer + inline query while running) + result badge. Expanded: curated scalars (default-deny via
	 * the adapter) grouped Input/Result, or the `/deep` process detail (plan / search cards / …). A
	 * successful analysis / dataset-profile detail REPLACES the generic row with its stats card.
	 * Auto-open while active, auto-collapse on settle unless the user toggled manually (sticky override).
	 */
	let {
		model,
		sourcesBySubQ,
		turnId,
		statsGroup
	}: {
		model: ToolRowModel;
		sourcesBySubQ?: Map<number, ResearchSource[]>;
		turnId?: string;
		statsGroup?: StatsGroup;
	} = $props();

	const interactions = getMessageInteractions();

	const INLINE_VALUE_MAX = 160;
	const LIVE_QUERY_MAX = 120;

	function toneClass(status: ToolRowModel['status']): string {
		switch (status) {
			case 'running':
			case 'completed':
				return 'text-foreground';
			case 'failed':
				return 'text-red-500';
			default:
				return 'text-muted-foreground';
		}
	}

	const detail = $derived(model.detail);
	const inputRows = $derived(model.rows.filter((r) => r.group === 'input'));
	const outputRows = $derived(model.rows.filter((r) => r.group === 'output'));
	const hasBody = $derived(model.rows.length > 0 || Boolean(detail));
	const liveQueryRaw = $derived(
		model.isRunning
			? model.rows.find((r) => r.key === 'query' || r.key === 'message')?.value
			: undefined
	);
	const liveQuery = $derived(
		liveQueryRaw ? messagePreview(liveQueryRaw, LIVE_QUERY_MAX) : undefined
	);
	const hasLongScalar = $derived(model.rows.some((r) => r.value.length > INLINE_VALUE_MAX));
	const isSubagentRunning = $derived(
		model.isRunning && (model.kind === 'subagent-call' || STATS_SANDBOX_TOOLS.has(model.name))
	);

	// null = follow auto (open == isRunning); boolean = sticky manual choice.
	let override = $state<boolean | null>(null);
	let prevRunning = untrack(() => model.isRunning);
	$effect(() => {
		// Reset the override on running → settle so auto-collapse applies again for a user who never toggled.
		if (prevRunning && !model.isRunning) override = override === true ? true : null;
		prevRunning = model.isRunning;
	});
	const open = $derived(override ?? model.isRunning);
</script>

{#snippet header()}
	<span class={cn('flex min-w-0 items-start gap-1.5 leading-5', toneClass(model.status))}>
		{#if model.status === 'running'}
			<Spinner class="mt-0.5 size-3.5 shrink-0 text-primary" />
		{:else if model.status === 'failed'}
			<Icon icon={XCircleIcon} class="mt-0.5 size-3.5 shrink-0 text-red-500" />
		{:else if model.status === 'denied'}
			<Icon icon={XCircleIcon} class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
		{:else if model.kind === 'subagent-call'}
			<Icon icon={TelescopeIcon} class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
		{:else}
			<Icon icon={toolGlyph(model.name)} class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
		{/if}
		<span class="min-w-0">
			{#if isSubagentRunning}
				<ElapsedLabel base={model.title} startedAt={model.startedAt} />
			{:else if model.isRunning}
				<Shimmer as="span" text={model.title} />
			{:else}
				<span>{model.title}</span>
			{/if}
			{#if liveQuery}<span class="text-muted-foreground"> · {liveQuery}</span>{/if}
		</span>
	</span>
{/snippet}

{#snippet resultBadge()}
	{#if model.description}
		<Badge
			variant="secondary"
			class="mt-px shrink-0 rounded-full bg-muted/60 px-2 py-0 text-[11px] font-medium text-muted-foreground"
		>
			{model.description}
		</Badge>
	{/if}
{/snippet}

{#snippet scalarRows()}
	{#if inputRows.length > 0}
		<dl class="grid gap-1">
			<dt class="text-[11px] font-medium text-muted-foreground/70">Masukan</dt>
			{#each inputRows as row (row.key)}
				<div class="flex min-w-0 gap-1.5">
					<dt class="shrink-0 text-muted-foreground">{row.label}:</dt>
					<dd class="min-w-0 break-words text-foreground">{row.value}</dd>
				</div>
			{/each}
		</dl>
	{/if}
	{#if outputRows.length > 0}
		<dl class="grid gap-1">
			<dt class="text-[11px] font-medium text-muted-foreground/70">Hasil</dt>
			{#each outputRows as row (row.key)}
				<div class="flex min-w-0 gap-1.5">
					<dt class="shrink-0 text-muted-foreground">{row.label}:</dt>
					<dd
						class={cn(
							'min-w-0 break-words',
							model.status === 'failed' ? 'text-red-500' : 'text-foreground'
						)}
					>
						{row.value}
					</dd>
				</div>
			{/each}
		</dl>
	{/if}
{/snippet}

{#snippet deepDetailBody(d: NonNullable<ToolRowModel['detail']>)}
	{#if d.kind === 'plan'}
		<div class="grid gap-2">
			{#if d.plan}
				<p class="leading-5 break-words whitespace-pre-wrap text-muted-foreground">{d.plan}</p>
			{/if}
			{#if d.subQuestions.length > 0}
				<ul class="list-disc space-y-0.5 pl-4 text-muted-foreground">
					{#each d.subQuestions as q, i (`${i}-${q.slice(0, 24)}`)}
						<li>{q}</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else if d.kind === 'text'}
		<p class="leading-5 break-words whitespace-pre-wrap text-muted-foreground">{d.text}</p>
	{:else if d.kind === 'citations'}
		<p class="text-muted-foreground">
			{d.count > 0 ? `${d.count} sumber diberi nomor sitasi [n].` : 'Belum ada sumber bernomor.'}
		</p>
	{/if}
{/snippet}

{#if detail?.kind === 'analysis'}
	<AnalysisRunCard
		{model}
		{detail}
		group={statsGroup}
		onOpen={interactions.openStats && statsGroup
			? () => interactions.openStats?.(detail.runKey)
			: undefined}
	/>
{:else if detail?.kind === 'dataset-profile'}
	<DatasetProfileCard {detail} />
{:else if !hasBody}
	<div class="flex min-w-0 items-start gap-1.5">
		{@render header()}
		{@render resultBadge()}
	</div>
{:else}
	<Collapsible.Root class="min-w-0" {open} onOpenChange={(next) => (override = next)}>
		<Collapsible.Trigger
			class="group -mx-1.5 flex w-full min-w-0 items-start gap-1.5 rounded-[8px] px-1.5 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			{@render header()}
			{@render resultBadge()}
			<Icon
				icon={ChevronDownIcon}
				class="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:rotate-180 group-data-[state=open]:opacity-100"
			/>
		</Collapsible.Trigger>
		<Collapsible.Content class="overflow-hidden">
			{#if detail && detail.kind === 'search'}
				<div class="mt-1.5 text-[12px]">
					<DeepSearchCards subSearches={detail.subSearches} {sourcesBySubQ} {turnId} />
				</div>
			{:else if detail && detail.kind === 'search-flat'}
				<ScrollDetailTrigger
					class="mt-1.5"
					onOpen={interactions.openStep
						? () => interactions.openStep?.(model.toolCallId)
						: undefined}
				>
					<div class="text-[12px]"><SourceCardList sources={detail.sources} /></div>
				</ScrollDetailTrigger>
			{:else if detail && detail.kind === 'plan'}
				<ScrollDetailTrigger
					class="mt-1.5"
					onOpen={interactions.openPlan && turnId
						? () => interactions.openPlan?.(turnId)
						: undefined}
				>
					<div class="p-2 text-[12px]">{@render deepDetailBody(detail)}</div>
				</ScrollDetailTrigger>
			{:else if detail && detail.kind === 'text'}
				<ScrollDetailTrigger
					class="mt-1.5"
					onOpen={interactions.openStep
						? () => interactions.openStep?.(model.toolCallId)
						: undefined}
				>
					<div class="p-2 text-[12px]">{@render deepDetailBody(detail)}</div>
				</ScrollDetailTrigger>
			{:else if hasLongScalar}
				<ScrollDetailTrigger
					class="mt-1.5"
					onOpen={interactions.openStep
						? () => interactions.openStep?.(model.toolCallId)
						: undefined}
				>
					<div class="grid gap-2 p-2 text-[12px]">
						{@render scalarRows()}
						{#if detail}{@render deepDetailBody(detail)}{/if}
					</div>
				</ScrollDetailTrigger>
			{:else}
				<div class="mt-1.5 grid gap-2 text-[12px]">
					{@render scalarRows()}
					{#if detail}{@render deepDetailBody(detail)}{/if}
				</div>
			{/if}
		</Collapsible.Content>
	</Collapsible.Root>
{/if}
