<script lang="ts">
	import { cn, type WithElementRef } from '../../utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableSectionElement>> = $props();
</script>

<thead
	bind:this={ref}
	data-slot="table-header"
	class={cn('bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] [&_tr]:border-b-2', className)}
	{...restProps}
>
	{@render children?.()}
</thead>
