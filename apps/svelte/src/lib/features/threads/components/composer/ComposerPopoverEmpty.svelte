<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon, SearchIcon } from '$lib/icons';

	let { title, hint }: { title: string; hint?: Snippet } = $props();
</script>

<div class="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
	<span
		class="inline-flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
	>
		<Icon icon={SearchIcon} class="size-4" />
	</span>
	<p class="text-control font-medium text-foreground">{title}</p>
	{#if hint}
		<p class="text-micro text-muted-foreground">{@render hint()}</p>
	{/if}
</div>
