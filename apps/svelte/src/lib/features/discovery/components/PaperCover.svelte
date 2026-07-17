<script lang="ts">
	import GenerativeCover from '$lib/components/GenerativeCover.svelte';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { kindLabel, type DiscoveryItem } from '../model';
	import PdfThumb from './PdfThumb.svelte';

	/**
	 * Layered cover: GenerativeCover as the always-legible base (never blank); for a paper with a PDF,
	 * PdfThumb overlays and covers the base once page-1 renders. We keep the URL that FAILED (not a
	 * boolean) + `{#key pdfUrl}` on PdfThumb → when this slot is reused for another paper (e.g. an
	 * unkeyed hero whose item changes), stale state doesn't carry: a new URL ≠ failedUrl → shows again,
	 * and PdfThumb remounts clean per URL.
	 */
	let { item, class: className }: { item: DiscoveryItem; class?: string } = $props();

	let failedUrl = $state<string | null>(null);
	const pdfUrl = $derived(item.pdfUrl);
</script>

<div class={cn('relative overflow-hidden rounded-[12px]', className)} aria-hidden="true">
	<GenerativeCover title={item.title} label={kindLabel()} openAccess={item.isOpenAccess} />
	{#if pdfUrl && failedUrl !== pdfUrl}
		{#key pdfUrl}
			<PdfThumb {pdfUrl} onFail={() => (failedUrl = pdfUrl ?? null)} />
		{/key}
	{/if}
</div>
