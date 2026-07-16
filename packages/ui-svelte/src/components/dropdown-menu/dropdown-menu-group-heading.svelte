<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { cn } from '../../utils.js';
	import type { ComponentProps } from 'svelte';
	import { menuGroupHeadingClass } from '../../recipes.js';

	let {
		ref = $bindable(null),
		class: className,
		inset,
		...restProps
	}: ComponentProps<typeof DropdownMenuPrimitive.GroupHeading> & {
		inset?: boolean;
	} = $props();
</script>

<DropdownMenuPrimitive.GroupHeading
	bind:ref
	data-slot="dropdown-menu-group-heading"
	data-inset={inset}
	class={cn(menuGroupHeadingClass, 'data-[inset]:ps-8', className)}
	{...restProps}
/>
