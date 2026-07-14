<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	/** Judul seksi reader (serif) + opsional hitung. */
	let {
		title,
		count,
		class: className,
		children
	}: {
		title: string;
		count?: number;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<section class={cn('mt-9', className)}>
	<h2 class="mb-3 flex items-baseline gap-2 font-serif text-lg leading-tight text-foreground">
		{title}
		{#if count != null}<span class="text-[13px] font-sans font-normal text-muted-foreground"
				>{count}</span
			>{/if}
	</h2>
	{@render children()}
</section>
