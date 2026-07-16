<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '@aqsha/ui-svelte/utils';

	let { class: className, children }: { class?: string; children: Snippet } = $props();
</script>

<section class={cn('overflow-hidden rounded-xl border-2 border-border bg-card', className)}>
	{@render children()}
</section>
