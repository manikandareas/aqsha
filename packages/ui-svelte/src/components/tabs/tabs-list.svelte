<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '../../utils.js';

	let { ref = $bindable(null), class: className, ...restProps }: TabsPrimitive.ListProps = $props();
</script>

<TabsPrimitive.List
	bind:ref
	data-slot="tabs-list"
	class={cn(
		'inline-flex w-fit items-center gap-1.5 rounded-md border-2 border-border bg-transparent p-[5px] text-muted-foreground',
		className
	)}
	{...restProps}
/>
