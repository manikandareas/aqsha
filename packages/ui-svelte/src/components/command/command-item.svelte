<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';
	import { cn } from '../../utils.js';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { CheckIcon } from '@hugeicons/core-free-icons';
	import { commandItemClass } from '../../recipes.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: CommandPrimitive.ItemProps = $props();
</script>

<CommandPrimitive.Item
	bind:ref
	data-slot="command-item"
	class={cn(commandItemClass, className)}
	{...restProps}
>
	{@render children?.()}
	<HugeiconsIcon
		icon={CheckIcon}
		strokeWidth={2}
		class="text-mint-foreground ml-auto opacity-0 group-has-[[data-slot=command-shortcut]]/command-item:hidden group-data-[checked=true]/command-item:opacity-100"
	/>
</CommandPrimitive.Item>
