<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { cn, type WithoutChild } from '../../utils.js';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { CircleIcon } from '@hugeicons/core-free-icons';
	import { menuIndicatorItemClass, menuIndicatorIconClass } from '../../recipes.js';

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
	class={cn(menuIndicatorItemClass, className)}
	{...restProps}
>
	{#snippet children({ checked })}
		<span
			class={cn(menuIndicatorIconClass, 'absolute right-2 flex items-center justify-center')}
		>
			{#if checked}
				<HugeiconsIcon icon={CircleIcon} strokeWidth={2} class="size-2 fill-current" />
			{/if}
		</span>
		{@render childrenProp?.({ checked })}
	{/snippet}
</ContextMenuPrimitive.RadioItem>
