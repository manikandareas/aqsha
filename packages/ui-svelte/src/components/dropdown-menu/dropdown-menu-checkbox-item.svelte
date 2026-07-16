<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { MinusSignIcon } from '@hugeicons/core-free-icons';
	import { CheckIcon } from '@hugeicons/core-free-icons';
	import { cn, type WithoutChildrenOrChild } from '../../utils.js';
	import type { Snippet } from 'svelte';
	import { menuIndicatorItemClass, menuIndicatorIconClass } from '../../recipes.js';

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		indeterminate = $bindable(false),
		class: className,
		children: childrenProp,
		...restProps
	}: WithoutChildrenOrChild<DropdownMenuPrimitive.CheckboxItemProps> & {
		children?: Snippet;
	} = $props();
</script>

<DropdownMenuPrimitive.CheckboxItem
	bind:ref
	bind:checked
	bind:indeterminate
	data-slot="dropdown-menu-checkbox-item"
	class={cn(menuIndicatorItemClass, className)}
	{...restProps}
>
	{#snippet children({ checked, indeterminate })}
		<span
			class={cn(menuIndicatorIconClass, 'absolute right-2 flex items-center justify-center')}
			data-slot="dropdown-menu-checkbox-item-indicator"
		>
			{#if indeterminate}
				<HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
			{:else if checked}
				<HugeiconsIcon icon={CheckIcon} strokeWidth={2} />
			{/if}
		</span>
		{@render childrenProp?.()}
	{/snippet}
</DropdownMenuPrimitive.CheckboxItem>
