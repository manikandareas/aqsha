<script lang="ts">
	import type { HTMLTableAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '../../utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLTableAttributes> = $props();
</script>

<div
	data-slot="table-container"
	class="border-border bg-card relative w-full overflow-x-auto rounded-lg border-2"
>
	<table
		bind:this={ref}
		data-slot="table"
		class={cn('w-full caption-bottom text-field', className)}
		{...restProps}
	>
		{@render children?.()}
	</table>
</div>
