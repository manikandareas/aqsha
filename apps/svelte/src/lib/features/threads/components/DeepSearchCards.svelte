<script lang="ts">
	import { Spinner } from '$lib/components/ui/spinner';
	import { researchSourceToCard } from '../lib/source-card';
	import type { DeepSubSearch, SourceCardData } from '../lib/timeline-types';
	import type { ResearchSource } from '../types';
	import { getMessageInteractions } from './message-interactions';
	import ScrollDetailTrigger from './ScrollDetailTrigger.svelte';
	import SourceCardList from './SourceCardList.svelte';

	/**
	 * Kartu sub-agen pencarian `/deep` (step `search-literature`). Satu blok per sub-pertanyaan
	 * (status running/selesai) berisi daftar kartu sumber sebagai PREVIEW. Daftar tak di-scroll inline:
	 * di-bungkus `ScrollDetailTrigger` → klik membuka panel langkah pencarian (sumber → URL). Sumber
	 * di-resolve LIVE dari yang dipancarkan step (`sub.sources`); fallback ke `research_sources` (DB,
	 * di-join `subQuestionIndex`). Pure presentation: tak fetch sendiri. Port `deep-search-cards.tsx`.
	 */
	let {
		subSearches,
		sourcesBySubQ,
		turnId
	}: {
		subSearches: DeepSubSearch[];
		sourcesBySubQ?: Map<number, ResearchSource[]>;
		/** Run id `/deep` pesan ini — men-scope panel pencarian per-run (klik buka detail run yang benar). */
		turnId?: string;
	} = $props();

	const interactions = getMessageInteractions();
</script>

{#snippet subSearchBlock(sub: DeepSubSearch, sources: SourceCardData[])}
	{@const running = sub.status === 'running' || sub.status === 'pending'}
	<div class="flex min-w-0 flex-col gap-2">
		<div class="flex min-w-0 items-start gap-1.5">
			{#if running}
				<Spinner class="mt-0.5 size-3.5 shrink-0 text-primary" />
			{:else}
				<span
					class="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground tabular-nums"
				>
					{sub.index + 1}
				</span>
			{/if}
			<p class="min-w-0 break-words font-medium text-[12px] text-foreground leading-5">
				{sub.subQuestion}
			</p>
		</div>
		{#if sources.length > 0}
			<ScrollDetailTrigger
				onOpen={interactions.openSearch && turnId
					? () => interactions.openSearch?.(turnId, sub.index)
					: undefined}
			>
				<SourceCardList {sources} />
			</ScrollDetailTrigger>
		{:else}
			<p class="text-[11px] text-muted-foreground/70">
				{running ? 'Mencari sumber…' : 'Belum ada sumber.'}
			</p>
		{/if}
	</div>
{/snippet}

{#if subSearches.length > 0}
	<div class="flex flex-col gap-3">
		{#each subSearches as sub (sub.index)}
			{@const sources =
				sub.sources ?? (sourcesBySubQ?.get(sub.index) ?? []).map(researchSourceToCard)}
			{@render subSearchBlock(sub, sources)}
		{/each}
	</div>
{/if}
