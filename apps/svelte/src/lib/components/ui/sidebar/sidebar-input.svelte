<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { cn } from '@aqsha/ui-svelte/utils';

	let {
		ref = $bindable(null),
		value = $bindable(''),
		class: className,
		...restProps
	}: ComponentProps<typeof Input> = $props();
</script>

<Input
	bind:ref
	bind:value
	data-slot="sidebar-input"
	data-sidebar="input"
	class={cn('bg-background h-8 w-full shadow-none', className)}
	{...restProps}
/>
