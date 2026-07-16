<script lang="ts">
	import { cn, type WithElementRef } from '../../utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<kbd
	bind:this={ref}
	data-slot="kbd"
	class={cn(
		"bg-card text-muted-foreground border-border h-[22px] w-fit min-w-[22px] gap-1 rounded-sm border-2 border-b-[3px] px-1.5 font-mono text-[0.68rem] font-semibold [&_svg:not([class*='size-'])]:size-3 pointer-events-none inline-flex items-center justify-center select-none",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</kbd>
