<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ChevronRightIcon } from '@hugeicons/core-free-icons';
	import { cn } from '../../utils.js';
	import { menuSubTriggerClass } from '../../recipes.js';

	let {
		ref = $bindable(null),
		class: className,
		inset,
		children,
		...restProps
	}: DropdownMenuPrimitive.SubTriggerProps & {
		inset?: boolean;
	} = $props();
</script>

<DropdownMenuPrimitive.SubTrigger
	bind:ref
	data-slot="dropdown-menu-sub-trigger"
	data-inset={inset}
	class={cn(menuSubTriggerClass, className)}
	{...restProps}
>
	{@render children?.()}
	<HugeiconsIcon icon={ChevronRightIcon} strokeWidth={2} class="ml-auto" />
</DropdownMenuPrimitive.SubTrigger>
