<script lang="ts">
	import { sourceHref } from '$lib/features/threads/lib/source-card';
	import type { SourceCardData } from '$lib/features/threads/lib/timeline-types';

	/**
	 * Pill nomor paper `[n]` kompak untuk tabel viz (kolom Papers) — resolve ke kartu sumber lewat
	 * peta sitasi yang diteruskan sebagai prop (Phase 6: reactive snippet props, bukan React context).
	 * Nomor tanpa kartu ter-resolve tetap tampil sebagai teks `[n]` (degradasi mulus). Maksimal `max`
	 * pill; sisanya diringkas "+n lainnya".
	 */
	let {
		papers,
		max = 3,
		citations
	}: { papers: number[]; max?: number; citations?: Map<number, SourceCardData[]> } = $props();

	const shown = $derived(papers.slice(0, max));
	const extra = $derived(papers.length - shown.length);

	const chipClass =
		'inline-flex items-center rounded-md bg-muted px-2 py-1 font-medium font-mono text-[10px] text-muted-foreground leading-none tabular-nums transition-colors hover:bg-accent hover:text-foreground';
</script>

{#snippet pill(n: number)}
	<span class={chipClass}>[{n}]</span>
{/snippet}

<span class="inline-flex flex-wrap items-center gap-1.5">
	{#each shown as n (n)}
		{@const card = citations?.get(n)?.[0]}
		{@const href = card ? sourceHref(card) : null}
		{#if href}
			<a {href} target="_blank" rel="noopener noreferrer" title={card?.title} class="no-underline">
				{@render pill(n)}
			</a>
		{:else}
			<span title={card?.title}>
				{@render pill(n)}
			</span>
		{/if}
	{/each}
	{#if extra > 0}
		<span
			class={chipClass}
			title={papers
				.slice(max)
				.map((n) => `[${n}]`)
				.join(' ')}
		>
			+{extra} lagi
		</span>
	{/if}
</span>
