<script lang="ts">
	import { cn } from '$lib/utils';
	import type { DiscoveryItem } from '../model';
	import PaperCover from './PaperCover.svelte';

	/** Card media: direct photo for news/OG items; otherwise generative cover (open-access papers may overlay a PDF page-1 preview). */
	let {
		item,
		title,
		class: className
	}: { item: DiscoveryItem; title: string; class?: string } = $props();
</script>

{#if item.imageUrl}
	<div class={cn('relative overflow-hidden rounded-[12px] bg-muted', className)}>
		<img
			src={item.imageUrl}
			alt={title}
			loading="lazy"
			class="absolute inset-0 h-full w-full object-cover"
		/>
	</div>
{:else}
	<PaperCover {item} class={className} />
{/if}
