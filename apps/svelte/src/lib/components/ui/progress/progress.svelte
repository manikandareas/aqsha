<script lang="ts">
	import { Progress as ProgressPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';

	// Port of @aqsha/ui/components/progress (Radix Progress). `value` is 0–100; the
	// indicator slides in via translateX with the same formula the React card used.
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
	class={cn('bg-secondary relative h-4 w-full overflow-hidden rounded-full', className)}
	{value}
	{max}
	{...restProps}
>
	<div
		data-slot="progress-indicator"
		class="bg-primary h-full w-full flex-1 transition-all"
		style="transform: translateX(-{100 - (value ?? 0)}%)"
	></div>
</ProgressPrimitive.Root>
