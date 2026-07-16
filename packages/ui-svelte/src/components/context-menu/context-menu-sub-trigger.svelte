<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { cn, type WithoutChild } from '../../utils.js';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ChevronRightIcon } from '@hugeicons/core-free-icons';

	let {
		ref = $bindable(null),
		class: className,
		inset,
		children,
		...restProps
	}: WithoutChild<ContextMenuPrimitive.SubTriggerProps> & {
		inset?: boolean;
	} = $props();
</script>

<ContextMenuPrimitive.SubTrigger
	bind:ref
	data-slot="context-menu-sub-trigger"
	data-inset={inset}
	class={cn(
		"flex cursor-default items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[0.82rem] text-muted-foreground outline-hidden select-none focus:bg-mint-soft focus:text-foreground data-highlighted:bg-mint-soft data-highlighted:text-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<HugeiconsIcon icon={ChevronRightIcon} strokeWidth={2} class="ml-auto size-3.5" />
</ContextMenuPrimitive.SubTrigger>
