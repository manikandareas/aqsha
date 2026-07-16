<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '../../utils.js';

	// The dark footer band: a near-black warm panel whose links read in band-ink.
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<section
	bind:this={ref}
	data-slot="band"
	class={cn(
		'bg-band text-band-ink flex flex-col gap-6 rounded-lg px-[34px] py-10 [&_a]:text-band-ink/70 [&_a]:font-medium [&_a:hover]:text-band-ink',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</section>
