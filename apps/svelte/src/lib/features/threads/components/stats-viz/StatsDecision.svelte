<script lang="ts">
	import type { StatsDecisionBlock } from '@aqsha/chat-core/stats-viz';
	import { STATS_VERDICT_META } from './verdict-meta';

	/**
	 * Kartu kesimpulan rule-based: judul + daftar keputusan. Tiap keputusan membawa chip verdict
	 * (rule-based, dihitung Python — bukan tulisan model) + narasi interpretasi bergaya Bab 4.
	 * Bukan tabel bernomor (bukan "Tabel n"): pelengkap naratif tabel di atasnya.
	 */
	let { block }: { block: StatsDecisionBlock } = $props();
</script>

<div class="stats-viz my-5 min-w-0 rounded-xl border bg-muted/20 p-4 not-prose">
	<p class="mb-3 font-semibold text-[13px] text-foreground leading-5">{block.title}</p>
	<ul class="flex flex-col gap-3">
		{#each block.decisions as d (d.id)}
			{@const meta = STATS_VERDICT_META[d.verdict]}
			<li class="flex min-w-0 flex-col gap-1">
				<div class="flex min-w-0 flex-wrap items-center gap-2">
					<span
						class={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-[11px] ${meta.chip}`}
					>
						<span class={`size-1.5 rounded-full ${meta.dot}`} aria-hidden="true"></span>
						{meta.label}
					</span>
					{#if d.label}
						<span class="min-w-0 font-medium text-[12.5px] text-foreground">{d.label}</span>
					{/if}
					{#if d.rule}
						<span class="shrink-0 font-mono text-[11px] text-muted-foreground/80">
							{d.rule}
						</span>
					{/if}
				</div>
				{#if d.interpretation}
					<p class="min-w-0 break-words text-[12.5px] text-muted-foreground leading-5">
						{d.interpretation}
					</p>
				{/if}
			</li>
		{/each}
	</ul>
</div>
