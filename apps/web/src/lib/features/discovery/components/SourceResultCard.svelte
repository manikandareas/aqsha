<script lang="ts">
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, BookOpenIcon, CheckIcon, ExternalLinkIcon, PlusIcon } from '$lib/icons';
	import type { SearchPaper } from '../api';

	/** Kartu hasil pencarian literatur; Simpan = citation-first (perpustakaan + link proyek). */
	let {
		paper,
		saved,
		pending,
		onSave
	}: {
		paper: SearchPaper;
		saved: boolean;
		pending: boolean;
		onSave: () => void;
	} = $props();

	const meta = $derived(
		[
			paper.authors.slice(0, 3).join(', ') + (paper.authors.length > 3 ? ' dkk.' : ''),
			paper.year,
			paper.venue
		]
			.filter(Boolean)
			.join(' · ')
	);

	// Reader route decodes its param as-is, so the canonical key (which can contain `/` for
	// DOI-style keys) must be percent-encoded here rather than routed through resolve() —
	// resolve() inserts the raw param value and rejects/mangles slashes inside a segment.
	const readerHref = $derived(`/app/explore/${encodeURIComponent(paper.key)}`);
</script>

<article class="flex flex-col gap-2 rounded-md border-2 border-border bg-card p-4">
	<div class="flex items-start justify-between gap-3">
		<h3 class="min-w-0 flex-1 text-sm font-medium leading-snug">{paper.title}</h3>
		{#if paper.isOpenAccess}
			<Badge variant="outline" class="shrink-0">open access</Badge>
		{/if}
	</div>
	{#if meta}
		<p class="text-label text-muted-foreground">{meta}</p>
	{/if}
	{#if paper.snippet}
		<p class="line-clamp-3 text-sm text-muted-foreground">{paper.snippet}</p>
	{/if}
	<div class="mt-1 flex items-center gap-2">
		<Button type="button" size="sm" class="gap-1.5" disabled={pending || saved} onclick={onSave}>
			{#if saved}
				<Icon icon={CheckIcon} class="size-3.5" /> Tersimpan
			{:else}
				<Icon icon={PlusIcon} class="size-3.5" /> {pending ? 'Menyimpan…' : 'Simpan'}
			{/if}
		</Button>
		<Button href={readerHref} variant="outline" size="sm" class="gap-1.5">
			<Icon icon={BookOpenIcon} class="size-3.5" /> Baca
		</Button>
		{#if paper.url}
			<Button
				href={paper.url}
				target="_blank"
				rel="noopener"
				variant="ghost"
				size="icon"
				class="size-7"
				aria-label="Buka sumber asli"
			>
				<Icon icon={ExternalLinkIcon} class="size-3.5" />
			</Button>
		{/if}
		{#if paper.citedByCount != null}
			<span class="ml-auto text-label text-muted-foreground">{paper.citedByCount} sitasi</span>
		{/if}
	</div>
</article>
