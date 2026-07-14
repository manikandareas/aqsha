<script lang="ts">
	import type { Snippet } from 'svelte';

	let { label, children }: { label?: string; children: Snippet } = $props();
</script>

<div>
	{#if label != null}
		<div
			class="flex items-center gap-2 px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground first:pt-1"
		>
			<span class="truncate">{label}</span>
		</div>
	{/if}
	{@render children()}
</div>
