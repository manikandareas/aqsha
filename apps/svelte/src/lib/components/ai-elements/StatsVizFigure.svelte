<script lang="ts">
	import type { StatsVizContextValue } from './contexts';
	import { STATS_VERDICT_META } from '$lib/features/threads/components/stats-viz/verdict-meta';

	// `<statsviz runkey>` gate — port of `StatsVizMarkdownComponent` / `stats-block.tsx`. ANTI-FORGERY
	// DOUBLE GATE: renders NOTHING unless the `stats` gate prop is present AND `groups.get(runKey)`
	// returns a REAL group (blocks fetched from DB `analysis_result_blocks`). The marker is only a key;
	// a forged/invented runKey never becomes a table. Verbatim gate semantics; the block bodies are
	// rendered functionally (table / verdict chips / figure image). Rich chart polish = Phase 7.

	let { token, stats }: { token: { runKey?: string }; stats?: StatsVizContextValue } = $props();

	const runKey = $derived(typeof token.runKey === 'string' ? token.runKey : '');
	const ctx = $derived(stats);
	const group = $derived(ctx && runKey ? ctx.groups.get(runKey) : undefined);

	const cell = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
</script>

{#if ctx && runKey && group}
	<svelte:boundary>
		<section class="not-prose my-4 space-y-4 rounded-xl border p-4" data-stats-runkey={runKey}>
			<h4 class="text-sm font-semibold">{group.title}</h4>
			{#each group.blocks as block (block.id)}
				{#if block.type === 'stats-table'}
					<figure class="space-y-1">
						<div class="overflow-x-auto">
							<table class="w-full divide-y divide-border text-sm">
								<thead>
									<tr>
										{#each block.table.columns as col (col)}
											<th class="px-2 py-1 text-left font-medium">{col}</th>
										{/each}
									</tr>
								</thead>
								<tbody class="divide-y divide-border">
									{#each block.table.rows as row, i (i)}
										<tr>
											{#each row as c, j (j)}
												<td class="px-2 py-1 tabular-nums">{cell(c)}</td>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<figcaption class="text-xs text-muted-foreground">
							Tabel {block.tableNumber}: {block.table.title}
						</figcaption>
					</figure>
				{:else if block.type === 'stats-decision'}
					<div class="space-y-2">
						<div class="text-sm font-medium">{block.title}</div>
						{#each block.decisions as d (d.id)}
							{@const meta = STATS_VERDICT_META[d.verdict]}
							<div class="flex items-center gap-2 text-sm">
								<span class="size-2 shrink-0 rounded-full {meta.dot}"></span>
								<span class="min-w-0 flex-1 truncate">{d.label}</span>
								<span class="rounded-full px-2 py-0.5 text-xs {meta.chip}">{meta.label}</span>
							</div>
						{/each}
					</div>
				{:else if block.type === 'stats-figure'}
					<figure class="space-y-1">
						<img
							src={`data:image/png;base64,${block.png}`}
							alt={block.caption || `Gambar ${block.figureNumber}`}
							class="max-w-full rounded-md border"
						/>
						<figcaption class="text-xs text-muted-foreground">
							Gambar {block.figureNumber}{block.caption ? `: ${block.caption}` : ''}
						</figcaption>
					</figure>
				{/if}
			{/each}
		</section>
		{#snippet failed()}
			<div
				class="not-prose my-4 rounded-xl border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground"
			>
				Hasil analisis tidak dapat ditampilkan.
			</div>
		{/snippet}
	</svelte:boundary>
{/if}
