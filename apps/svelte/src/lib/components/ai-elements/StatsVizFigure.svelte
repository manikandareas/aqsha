<script lang="ts">
	import type { StatsVizContextValue } from './contexts';
	import { getMessageInteractions } from '$lib/features/threads/components/message-interactions';
	import StatsBlock from '$lib/features/threads/components/stats-viz/StatsBlock.svelte';

	// `<statsviz runkey>` gate — ANTI-FORGERY DOUBLE GATE: renders NOTHING unless the `stats` gate prop
	// is present AND `groups.get(runKey)` returns a REAL group (blocks fetched from DB
	// `analysis_result_blocks`). The marker is only a key; a forged/invented runKey never becomes a table.
	// Rich block bodies (SPSS-style table / verdict chips / figure) render via `StatsBlock`. A per-group
	// error boundary keeps one bad block from tearing down the report.

	let { token, stats }: { token: { runKey?: string }; stats?: StatsVizContextValue } = $props();

	const interactions = getMessageInteractions();
	const runKey = $derived(typeof token.runKey === 'string' ? token.runKey : '');
	const ctx = $derived(stats);
	const group = $derived(ctx && runKey ? ctx.groups.get(runKey) : undefined);
</script>

{#if ctx && runKey && group}
	<svelte:boundary>
		<div data-stats-runkey={runKey}>
			<StatsBlock
				{group}
				onOpenStats={interactions.openStats ? () => interactions.openStats?.(runKey) : undefined}
			/>
		</div>
		{#snippet failed()}
			<div
				class="not-prose my-4 rounded-xl border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground"
			>
				Hasil analisis tidak dapat ditampilkan.
			</div>
		{/snippet}
	</svelte:boundary>
{/if}
