<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	// `action` (React ReactNode) → optional Snippet rendered on the right.
	let {
		title,
		description,
		action,
		class: className
	}: {
		title: string;
		description?: string;
		action?: Snippet;
		class?: string;
	} = $props();
</script>

<header
	class={cn(
		'flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4 sm:px-6',
		className
	)}
>
	<div class="min-w-0">
		<h2 class="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
		{#if description}
			<p class="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
		{/if}
	</div>
	{#if action}
		<div class="shrink-0">{@render action()}</div>
	{/if}
</header>
