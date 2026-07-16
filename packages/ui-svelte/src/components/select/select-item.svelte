<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { cn, type WithoutChild } from '../../utils.js';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { CheckIcon } from '@hugeicons/core-free-icons';
	import { menuIndicatorIconClass, selectItemClass } from '../../recipes.js';

	let {
		ref = $bindable(null),
		class: className,
		value,
		label,
		children: childrenProp,
		...restProps
	}: WithoutChild<SelectPrimitive.ItemProps> = $props();
</script>

<SelectPrimitive.Item
	bind:ref
	{value}
	data-slot="select-item"
	class={cn(selectItemClass, className)}
	{...restProps}
>
	{#snippet children({ selected, highlighted })}
		<span class="pointer-events-none absolute end-2 flex size-4 items-center justify-center">
			{#if selected}
				<HugeiconsIcon icon={CheckIcon} strokeWidth={2} class={menuIndicatorIconClass} />
			{/if}
		</span>
		<span class="flex flex-1 gap-2 shrink-0 whitespace-nowrap">
			{#if childrenProp}
				{@render childrenProp({ selected, highlighted })}
			{:else}
				{label || value}
			{/if}
		</span>
	{/snippet}
</SelectPrimitive.Item>
