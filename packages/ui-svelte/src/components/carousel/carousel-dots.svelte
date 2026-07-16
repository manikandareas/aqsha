<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '../../utils.js';
	import { getEmblaContext } from './context.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();

	const emblaCtx = getEmblaContext('<Carousel.Dots/>');
</script>

<div
	bind:this={ref}
	data-slot="carousel-dots"
	role="tablist"
	aria-label="Carousel slides"
	class={cn('flex items-center gap-[7px]', className)}
	{...restProps}
>
	{#each emblaCtx.scrollSnaps as _, index (index)}
		<button
			type="button"
			role="tab"
			aria-selected={emblaCtx.selectedIndex === index}
			aria-label={`Slide ${index + 1}`}
			data-active={emblaCtx.selectedIndex === index ? '' : undefined}
			class="bg-border focus-visible:ring-ring/50 focus-visible:border-ring data-[active]:bg-coral h-[9px] w-[9px] rounded-full border-0 p-0 transition-all duration-200 outline-none focus-visible:ring-3 data-[active]:w-[22px]"
			onclick={() => emblaCtx.scrollTo(index)}
		></button>
	{/each}
</div>
