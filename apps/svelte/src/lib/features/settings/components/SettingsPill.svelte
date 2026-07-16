<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '@aqsha/ui-svelte/utils';

	// Neutral token-based status chip (subscription status, "Saat ini").
	let { class: className, children }: { class?: string; children: Snippet } = $props();
</script>

<span
	class={cn(
		'inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground',
		className
	)}
>
	{@render children()}
</span>
