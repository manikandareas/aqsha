<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '@aqsha/ui-svelte/utils';

	/** Plain panel title label. The richer dropdown-trigger variant ships with its consumer. */
	let { class: className, children }: { class?: string; children: Snippet } = $props();
</script>

<span class={cn('truncate text-[12px] font-normal leading-snug text-foreground', className)}>
	{@render children()}
</span>
