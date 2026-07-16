<script lang="ts">
	import { cn } from '../../utils.js';
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { menuItemClass, menuItemDestructiveClass } from '../../recipes.js';

	let {
		ref = $bindable(null),
		class: className,
		inset,
		variant = 'default',
		...restProps
	}: ContextMenuPrimitive.ItemProps & {
		inset?: boolean;
		variant?: 'default' | 'destructive';
	} = $props();
</script>

<ContextMenuPrimitive.Item
	bind:ref
	data-slot="context-menu-item"
	data-inset={inset}
	data-variant={variant}
	class={cn('group/context-menu-item', menuItemClass, menuItemDestructiveClass, className)}
	{...restProps}
/>
