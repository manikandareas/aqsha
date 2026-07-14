<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	// Port of `conversation-empty-state.tsx` — the empty transcript state. `icon`/`children` are snippets.

	let {
		title = 'Belum ada pesan',
		description = 'Mulai percakapan untuk melihat pesan di sini',
		class: klass,
		icon,
		children
	}: {
		title?: string;
		description?: string;
		class?: string;
		icon?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<div class={cn('flex size-full flex-col items-center justify-center gap-3 p-8 text-center', klass)}>
	{#if children}
		{@render children()}
	{:else}
		{#if icon}
			<div class="text-muted-foreground">{@render icon()}</div>
		{/if}
		<div class="space-y-1">
			<h3 class="text-sm font-medium">{title}</h3>
			<p class="text-sm text-muted-foreground">{description}</p>
		</div>
	{/if}
</div>
