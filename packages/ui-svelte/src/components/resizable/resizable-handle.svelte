<script lang="ts">
	import * as ResizablePrimitive from 'paneforge';
	import { cn, type WithoutChildrenOrChild } from '../../utils.js';

	let {
		ref = $bindable(null),
		class: className,
		withHandle = false,
		...restProps
	}: WithoutChildrenOrChild<ResizablePrimitive.PaneResizerProps> & {
		withHandle?: boolean;
	} = $props();
</script>

<ResizablePrimitive.PaneResizer
	bind:ref
	data-slot="resizable-handle"
	class={cn(
		'relative flex w-0 items-center justify-center bg-border focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[direction=vertical]:h-0 data-[direction=vertical]:w-full',
		'after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2 data-[direction=vertical]:after:inset-x-0 data-[direction=vertical]:after:top-1/2 data-[direction=vertical]:after:h-3 data-[direction=vertical]:after:w-full data-[direction=vertical]:after:-translate-y-1/2 data-[direction=vertical]:after:translate-x-0',
		'[&[data-direction=vertical]>div]:h-3 [&[data-direction=vertical]>div]:w-8 [&[data-direction=vertical]>div>span]:h-0.5 [&[data-direction=vertical]>div>span]:w-3',
		className
	)}
	{...restProps}
>
	{#if withHandle}
		<div
			aria-hidden="true"
			class="z-10 flex h-8 w-3 items-center justify-center rounded-full border-2 border-border bg-card shadow-[0_2px_0_0_var(--border)]"
		>
			<span class="h-3 w-0.5 rounded-full bg-muted-foreground/60"></span>
		</div>
	{/if}
</ResizablePrimitive.PaneResizer>
