<script module lang="ts">
	import type { LiteraturePaper } from '../literature-search-types';

	/** Fields this row actually renders — a paper missing enrichment fields (pdfUrl, oaStatus, …) still renders fine. */
	export type LiteratureResultRowPaper = Pick<
		LiteraturePaper,
		| 'key'
		| 'title'
		| 'snippet'
		| 'url'
		| 'authors'
		| 'year'
		| 'venue'
		| 'citedByCount'
		| 'isOpenAccess'
		| 'hasPdf'
		| 'workType'
		| 'isRetracted'
		| 'topics'
	> &
		Partial<Pick<LiteraturePaper, 'doi' | 'pdfUrl' | 'publicationDate' | 'oaStatus' | 'language'>>;
</script>

<script lang="ts">
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Checkbox } from '@aqsha/ui-svelte/components/checkbox';
	import { Icon, AlertCircleIcon, ExternalLinkIcon, FileTextIcon } from '$lib/icons';
	import { formatCitationCount } from '$lib/features/discovery/format';
	import SaveSourceButton from '$lib/features/discovery/components/SaveSourceButton.svelte';
	import type { SourceSaveInput } from '$lib/features/discovery/source-save';

	/**
	 * Dense row for one literature search result: select checkbox, one internal reader link,
	 * abstract excerpt, metadata, badges, save-to-library, and the external source link. Does
	 * not duplicate `SaveSourceButton`'s own project picker — saving here is citation-first,
	 * account-library only, same as the discovery feed.
	 */
	let {
		paper,
		selected,
		onSelectedChange
	}: {
		paper: LiteratureResultRowPaper;
		selected: boolean;
		onSelectedChange: (key: string, selected: boolean) => void;
	} = $props();

	// Reader route decodes its param as-is, so a canonical key containing `/` (DOI-style keys)
	// must be percent-encoded here rather than routed through resolve().
	const readerHref = $derived(`/app/explore/${encodeURIComponent(paper.key)}`);

	const metaLine = $derived(
		[
			paper.authors.length > 0
				? paper.authors.slice(0, 3).join(', ') + (paper.authors.length > 3 ? ' dkk.' : '')
				: null,
			paper.year,
			paper.venue
		]
			.filter(Boolean)
			.join(' · ')
	);

	const citationLabel = $derived(formatCitationCount(paper.citedByCount ?? undefined));
	const workTypeLabel = $derived(paper.workType ? capitalize(paper.workType) : null);

	const saveInput = $derived<SourceSaveInput>({
		title: paper.title,
		doi: paper.doi ?? null,
		url: paper.url ?? null,
		authors: paper.authors,
		year: paper.year ?? null,
		venue: paper.venue ?? null
	});

	function capitalize(value: string): string {
		return value.length > 0 ? value[0]!.toUpperCase() + value.slice(1) : value;
	}

	function handleCheckedChange(checked: boolean | 'indeterminate'): void {
		onSelectedChange(paper.key, checked === true);
	}
</script>

<article class="flex gap-3 px-4 py-3.5">
	<Checkbox
		checked={selected}
		onCheckedChange={handleCheckedChange}
		aria-label={`Pilih ${paper.title}`}
		class="mt-0.5 size-5 shrink-0"
	/>

	<div class="min-w-0 flex-1">
		<div class="flex items-start justify-between gap-3">
			<h3 class="min-w-0 flex-1 text-[14.5px] leading-snug font-semibold text-foreground">
				<a href={readerHref} class="hover:underline underline-offset-4">{paper.title}</a>
			</h3>
			<SaveSourceButton source={saveInput} label="Simpan" variant="outline" size="sm" />
		</div>

		{#if metaLine}
			<p class="mt-1 text-label text-muted-foreground">{metaLine}</p>
		{/if}

		{#if paper.snippet}
			<p class="mt-1.5 line-clamp-2 text-[13px] leading-5 text-ink-soft">{paper.snippet}</p>
		{/if}

		{#if paper.isRetracted}
			<p
				class="mt-2 inline-flex w-fit items-center gap-1 rounded-[5px] border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive"
			>
				<Icon icon={AlertCircleIcon} class="size-3" /> Paper ditarik (retracted)
			</p>
		{/if}

		<div class="mt-2 flex flex-wrap items-center gap-1.5">
			{#if paper.isOpenAccess}
				<Badge variant="chip-mint">Open access</Badge>
			{/if}
			{#if workTypeLabel}
				<Badge variant="outline">{workTypeLabel}</Badge>
			{/if}
			{#if paper.hasPdf}
				<Badge variant="outline" class="gap-1">
					<Icon icon={FileTextIcon} class="size-3" /> PDF tersedia
				</Badge>
			{/if}
			{#if citationLabel}
				<span class="text-label text-muted-foreground">{citationLabel}</span>
			{/if}
			{#if paper.url}
				<a
					href={paper.url}
					target="_blank"
					rel="noreferrer"
					aria-label="Buka sumber asli"
					class="ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<Icon icon={ExternalLinkIcon} class="size-3.5" />
				</a>
			{/if}
		</div>
	</div>
</article>
