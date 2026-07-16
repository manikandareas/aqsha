<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';
	import { cn } from '../../utils.js';
	import { commandItemClass } from '../../recipes.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CommandPrimitive.LinkItemProps = $props();
</script>

<CommandPrimitive.LinkItem
	bind:ref
	data-slot="command-item"
	class={cn(commandItemClass, className)}
	{...restProps}
/>
