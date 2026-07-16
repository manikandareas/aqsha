<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '@aqsha/ui-svelte/utils';

	let { class: className, children }: { class?: string; children: Snippet } = $props();
</script>

<div
	class={cn('inline-flex gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5', className)}
>
	{@render children()}
</div>
