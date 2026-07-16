<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { CheckIcon } from '@hugeicons/core-free-icons';
	import { cn, type WithoutChild } from '../../utils.js';
	import { menuIndicatorItemClass, menuIndicatorIconClass } from '../../recipes.js';

	let {
		ref = $bindable(null),
		class: className,
		children: childrenProp,
		...restProps
	}: WithoutChild<DropdownMenuPrimitive.RadioItemProps> = $props();
</script>

<DropdownMenuPrimitive.RadioItem
	bind:ref
	data-slot="dropdown-menu-radio-item"
	class={cn(menuIndicatorItemClass, className)}
	{...restProps}
>
	{#snippet children({ checked })}
		<span
			class={cn(menuIndicatorIconClass, 'absolute right-2 flex items-center justify-center')}
			data-slot="dropdown-menu-radio-item-indicator"
		>
			{#if checked}
				<HugeiconsIcon icon={CheckIcon} strokeWidth={2} />
			{/if}
		</span>
		{@render childrenProp?.({ checked })}
	{/snippet}
</DropdownMenuPrimitive.RadioItem>
