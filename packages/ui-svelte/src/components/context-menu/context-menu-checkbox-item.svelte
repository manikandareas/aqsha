<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '../../utils.js';
	import type { Snippet } from 'svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { CheckIcon } from '@hugeicons/core-free-icons';
	import { menuIndicatorItemClass, menuIndicatorIconClass } from '../../recipes.js';

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		indeterminate = $bindable(false),
		class: className,
		inset,
		children: childrenProp,
		...restProps
	}: WithoutChildrenOrChild<ContextMenuPrimitive.CheckboxItemProps> & {
		inset?: boolean;
		children?: Snippet;
	} = $props();
</script>

<ContextMenuPrimitive.CheckboxItem
	bind:ref
	bind:checked
	bind:indeterminate
	data-slot="context-menu-checkbox-item"
	data-inset={inset}
	class={cn(menuIndicatorItemClass, className)}
	{...restProps}
>
	{#snippet children({ checked })}
		<span
			class={cn(menuIndicatorIconClass, 'absolute right-2 flex items-center justify-center')}
		>
			{#if checked}
				<HugeiconsIcon icon={CheckIcon} strokeWidth={2} />
			{/if}
		</span>
		{@render childrenProp?.()}
	{/snippet}
</ContextMenuPrimitive.CheckboxItem>
