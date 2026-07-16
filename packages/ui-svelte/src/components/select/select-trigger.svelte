<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { cn, type WithoutChild } from '../../utils.js';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ChevronDownIcon } from '@hugeicons/core-free-icons';

	let {
		ref = $bindable(null),
		class: className,
		children,
		size = 'default',
		...restProps
	}: WithoutChild<SelectPrimitive.TriggerProps> & {
		size?: 'sm' | 'default';
	} = $props();
</script>

<SelectPrimitive.Trigger
	bind:ref
	data-slot="select-trigger"
	data-size={size}
	class={cn(
		"flex w-fit items-center justify-between gap-2.5 rounded-md border-2 border-input bg-card ctl-inset px-3 py-1.5 text-[0.9rem] font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[state=open]:border-ring data-[size=default]:h-auto data-[size=default]:min-h-10 data-[size=sm]:h-auto data-[size=sm]:min-h-8 data-[size=sm]:rounded-sm data-[size=sm]:text-[0.82rem] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<HugeiconsIcon
		icon={ChevronDownIcon}
		strokeWidth={2}
		class="pointer-events-none size-3.5 text-muted-foreground"
	/>
</SelectPrimitive.Trigger>
