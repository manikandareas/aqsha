<script lang="ts">
	import { Progress as ProgressPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '../../utils.js';

	// Radix Progress via bits-ui. `value` is 0–100; the indicator slides in via translateX.
	let {
		ref = $bindable(null),
		class: className,
		max = 100,
		value = 0,
		...restProps
	}: WithoutChildrenOrChild<ProgressPrimitive.RootProps> = $props();
</script>

<ProgressPrimitive.Root
	bind:ref
	data-slot="progress"
	class={cn('bg-muted relative h-3 w-full overflow-hidden rounded-full', className)}
	{value}
	{max}
	{...restProps}
>
	<div
		data-slot="progress-indicator"
		class="bg-coral h-full w-full flex-1 rounded-full transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
		style="transform: translateX(-{100 - (value ?? 0)}%)"
	></div>
</ProgressPrimitive.Root>
