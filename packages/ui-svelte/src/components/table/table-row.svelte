<script lang="ts">
	import { cn, type WithElementRef } from '../../utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableRowElement>> = $props();
</script>

<tr
	bind:this={ref}
	data-slot="table-row"
	class={cn(
		'hover:bg-[color-mix(in_oklch,var(--muted)_40%,var(--card))] data-[state=selected]:bg-mint-soft border-b transition-colors last:border-b-0',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</tr>
