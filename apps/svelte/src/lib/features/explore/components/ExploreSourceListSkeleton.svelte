<script lang="ts">
	import ExploreSourceRowSkeleton from './ExploreSourceRowSkeleton.svelte';

	/**
	 * Loading stand-in for any `ExploreSourceRow` list (curated feed and literature results alike).
	 * Row shapes vary on a fixed cycle rather than randomly so server and client render identically.
	 */
	let {
		count = 5,
		label = 'Memuat hasil…'
	}: {
		count?: number;
		label?: string;
	} = $props();

	const SHAPES = [
		{
			badges: 2,
			titleClass: 'w-[88%]',
			titleSecondClass: 'w-[52%]',
			metaClass: 'w-[58%]',
			summaryClasses: ['w-full', 'w-[72%]']
		},
		{
			badges: 1,
			titleClass: 'w-[74%]',
			titleSecondClass: null,
			metaClass: 'w-[44%]',
			summaryClasses: ['w-full', 'w-full', 'w-[38%]']
		},
		{
			badges: 0,
			titleClass: 'w-[92%]',
			titleSecondClass: 'w-[34%]',
			metaClass: 'w-[50%]',
			summaryClasses: ['w-[86%]']
		},
		{
			badges: 2,
			titleClass: 'w-[68%]',
			titleSecondClass: null,
			metaClass: 'w-[62%]',
			summaryClasses: ['w-full', 'w-[56%]']
		},
		{
			badges: 1,
			titleClass: 'w-[84%]',
			titleSecondClass: 'w-[46%]',
			metaClass: 'w-[40%]',
			summaryClasses: ['w-full', 'w-[80%]']
		}
	];

	const rows = $derived(
		Array.from({ length: Math.max(count, 1) }, (_, index) => SHAPES[index % SHAPES.length])
	);
</script>

<div class="overflow-hidden" role="status" aria-label={label} aria-busy="true">
	{#each rows as shape, index (index)}
		<ExploreSourceRowSkeleton {...shape} />
	{/each}
</div>
