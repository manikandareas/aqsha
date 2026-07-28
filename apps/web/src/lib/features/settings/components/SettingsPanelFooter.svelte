<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '@aqsha/ui-svelte/utils';

	let { class: className, children }: { class?: string; children: Snippet } = $props();
</script>

<footer
	class={cn(
		'flex flex-wrap items-center gap-2 border-t border-border/60 bg-muted/20 px-5 py-3.5 sm:px-6',
		className
	)}
>
	{@render children()}
</footer>
