<script lang="ts">
	import { cn, type WithElementRef } from '../../utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>> = $props();
</script>

<span
	bind:this={ref}
	data-slot="context-menu-shortcut"
	class={cn(
		'text-muted-foreground group-focus/context-menu-item:text-foreground ml-auto text-[11px] tracking-widest',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</span>
