<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { WithElementRef } from '../../utils.js';
	import { cn } from '../../utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="input-otp-separator"
	role="separator"
	class={cn("[&_svg:not([class*='size-'])]:size-4 flex items-center", className)}
	{...restProps}
>
	{#if children}
		{@render children?.()}
	{:else}
		<div class="bg-border h-[3px] w-3 rounded-[2px]"></div>
	{/if}
</div>
