<script lang="ts">
	import { cn } from '../../utils.js';
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { menuItemClass, menuItemDestructiveClass } from '../../recipes.js';

	let {
		ref = $bindable(null),
		class: className,
		inset,
		variant = 'default',
		...restProps
	}: DropdownMenuPrimitive.ItemProps & {
		inset?: boolean;
		variant?: 'default' | 'destructive';
	} = $props();
</script>

<DropdownMenuPrimitive.Item
	bind:ref
	data-slot="dropdown-menu-item"
	data-inset={inset}
	data-variant={variant}
	class={cn('group/dropdown-menu-item', menuItemClass, menuItemDestructiveClass, className)}
	{...restProps}
/>
