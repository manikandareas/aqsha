<script lang="ts">
	import { Icon, SearchIcon } from '$lib/icons';
	import type { LiteratureFilterClause } from '../literature-search-types';

	let {
		onSelect
	}: {
		onSelect: (filterValue: string, filter: LiteratureFilterClause) => void;
	} = $props();

	// Categories map to stable OpenAlex fields, so a card narrows the search instead of only changing its text.
	const SUGGESTIONS = [
		{
			label: 'Teknologi',
			filterValue: 'computer science',
			fieldId: 'https://openalex.org/fields/17',
			accentClass: 'border-[#a5f3fc] bg-[#155e75] text-white',
			gradientFace: '#155e75',
			image: '/explore/technology-poster.webp'
		},
		{
			label: 'Kesehatan',
			filterValue: 'medicine',
			fieldId: 'https://openalex.org/fields/27',
			accentClass: 'border-[#fda4af] bg-[#9f1239] text-white',
			gradientFace: '#9f1239',
			image: '/explore/health-poster.webp'
		},
		{
			label: 'Lingkungan',
			filterValue: 'environmental science',
			fieldId: 'https://openalex.org/fields/23',
			accentClass: 'border-[#86efac] bg-[#166534] text-white',
			gradientFace: '#166534',
			image: '/explore/environment-poster.webp'
		},
		{
			label: 'Teknik',
			filterValue: 'engineering',
			fieldId: 'https://openalex.org/fields/22',
			accentClass: 'border-[#fde68a] bg-[#92400e] text-white',
			gradientFace: '#92400e',
			image: '/explore/engineering-poster.webp'
		},
		{
			label: 'Psikologi',
			filterValue: 'psychology',
			fieldId: 'https://openalex.org/fields/32',
			accentClass: 'border-[#c4b5fd] bg-[#5b21b6] text-white',
			gradientFace: '#5b21b6',
			image: '/explore/psychology-poster.webp'
		},
		{
			label: 'Ekonomi',
			filterValue: 'economics',
			fieldId: 'https://openalex.org/fields/20',
			accentClass: 'border-[#93c5fd] bg-[#1e40af] text-white',
			gradientFace: '#1e40af',
			image: '/explore/economic-poster.webp'
		},
		{
			label: 'Pertanian',
			filterValue: 'agriculture',
			fieldId: 'https://openalex.org/fields/11',
			accentClass: 'border-[#fdba74] bg-[#9a3412] text-white',
			gradientFace: '#9a3412',
			image: '/explore/agriculture-poster.webp'
		}
	] as const;
</script>

<nav aria-label="Saran pencarian">
	<div class="suggestions-scroll -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
		{#each SUGGESTIONS as suggestion (suggestion.label)}
			<button
				type="button"
				onclick={() => onSelect(suggestion.filterValue, { id: 'field', value: suggestion.fieldId })}
				aria-label={`Cari topik ${suggestion.label}`}
				class="group relative aspect-3/4 w-full min-w-44 flex-1 snap-start overflow-hidden rounded-lg border-2 border-border bg-card text-left transition-[border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-foreground/45 active:translate-y-0 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
			>
				<img
					src={suggestion.image}
					alt=""
					loading="lazy"
					decoding="async"
					class="absolute inset-0 size-full object-cover transition-transform duration-300 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
				/>
				<span class="pointer-events-none absolute inset-x-2 bottom-2 flex min-w-0 justify-start">
					<span
						class="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border-2 border-border bg-background/95 px-2 py-1 text-[11px] leading-4 font-semibold text-foreground"
					>
						<span
							class={`grid size-5 shrink-0 place-items-center rounded-full border btn-filled-gradient ${suggestion.accentClass}`}
							style:--btn-face={suggestion.gradientFace}
							aria-hidden="true"
						>
							<Icon icon={SearchIcon} class="size-3" />
						</span>
						<span class="min-w-0 truncate">{suggestion.label}</span>
					</span>
				</span>
			</button>
		{/each}
	</div>
</nav>

<style>
	.suggestions-scroll {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	.suggestions-scroll::-webkit-scrollbar {
		display: none;
	}
</style>
