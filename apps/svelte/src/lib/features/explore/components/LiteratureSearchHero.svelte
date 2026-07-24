<script lang="ts">
	import LiteratureSearchBar from './LiteratureSearchBar.svelte';

	/** Landing search prompt delegates filter navigation to the page that owns the draft lifecycle. */
	let {
		value,
		onValueChange,
		onSubmit,
		onOpenFilters
	}: {
		value: string;
		onValueChange: (query: string) => void;
		onSubmit: () => void;
		onOpenFilters: () => void;
	} = $props();

	const EXAMPLES = [
		'adaptasi iklim perkotaan',
		'transformer neural network',
		'stunting anak indonesia'
	];
</script>

<section class="flex flex-col items-center gap-6 px-2 pt-14 pb-8 text-center @2xl:pt-20">
	<div class="max-w-[560px] space-y-2">
		<h1
			class="font-heading text-[clamp(28px,3.2vw,40px)] leading-[1.08] font-medium tracking-tight text-balance text-foreground"
		>
			Cari literatur
		</h1>
		<p class="text-[14.5px] leading-relaxed text-muted-foreground">
			Telusuri paper OpenAlex dengan kata kunci, lalu persempit hasil lewat filter lanjutan.
		</p>
	</div>

	<div class="w-full max-w-[640px]">
		<LiteratureSearchBar
			compact={false}
			{value}
			{onValueChange}
			{onSubmit}
			{onOpenFilters}
		/>
	</div>

	<div class="flex flex-wrap items-center justify-center gap-2">
		<span class="text-[12px] font-medium text-muted-foreground">Contoh:</span>
		{#each EXAMPLES as example (example)}
			<button
				type="button"
				onclick={() => onValueChange(example)}
				class="rounded-full border border-dashed border-border px-3 py-1.5 font-mono text-[11.5px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
			>
				{example}
			</button>
		{/each}
	</div>
</section>
