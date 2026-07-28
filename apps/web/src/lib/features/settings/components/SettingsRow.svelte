<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '@aqsha/ui-svelte/utils';

	// Full-bleed label/value row. Stack several inside `divide-y divide-border/60`.
	let {
		label,
		description,
		children,
		class: className,
		descriptionClass
	}: {
		label: string;
		description?: string;
		children?: Snippet;
		class?: string;
		/** Reserve a stable height here when the description text is dynamic, so swapping it can't reflow the row. */
		descriptionClass?: string;
	} = $props();
</script>

<div
	class={cn(
		'flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-4 sm:px-6',
		className
	)}
>
	<div class="min-w-0">
		<p class="text-[13px] font-medium text-foreground">{label}</p>
		{#if description}
			<p class={cn('mt-0.5 text-[12px] leading-relaxed text-muted-foreground', descriptionClass)}>
				{description}
			</p>
		{/if}
	</div>
	{#if children}
		<div class="shrink-0 text-[13px]">{@render children()}</div>
	{/if}
</div>
