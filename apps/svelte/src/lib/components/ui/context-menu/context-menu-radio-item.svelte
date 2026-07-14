<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { cn, type WithoutChild } from '$lib/utils.js';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { CircleIcon } from '@hugeicons/core-free-icons';

	let {
		ref = $bindable(null),
		class: className,
		inset,
		children: childrenProp,
		...restProps
	}: WithoutChild<ContextMenuPrimitive.RadioItemProps> & {
		inset?: boolean;
	} = $props();
</script>

<ContextMenuPrimitive.RadioItem
	bind:ref
	data-slot="context-menu-radio-item"
	data-inset={inset}
	class={cn(
		"relative flex cursor-default items-center gap-1.5 rounded-md py-1.5 pr-8 pl-2.5 text-[12px] text-muted-foreground outline-hidden select-none focus:bg-muted/60 focus:text-foreground data-highlighted:bg-muted/60 data-highlighted:text-foreground focus:**:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
		className
	)}
	{...restProps}
>
	{#snippet children({ checked })}
		<span class="pointer-events-none absolute right-2 flex items-center justify-center">
			{#if checked}
				<HugeiconsIcon icon={CircleIcon} strokeWidth={2} class="size-2 fill-current" />
			{/if}
		</span>
		{@render childrenProp?.({ checked })}
	{/snippet}
</ContextMenuPrimitive.RadioItem>
