<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { cn, type WithoutChild } from '../../utils.js';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ChevronRightIcon } from '@hugeicons/core-free-icons';
	import { menuSubTriggerClass } from '../../recipes.js';

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
	class={cn(menuSubTriggerClass, className)}
	{...restProps}
>
	{@render children?.()}
	<HugeiconsIcon icon={ChevronRightIcon} strokeWidth={2} class="ml-auto size-3.5" />
</ContextMenuPrimitive.SubTrigger>
