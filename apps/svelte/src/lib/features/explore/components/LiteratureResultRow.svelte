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

<article
	class="group grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-4 py-5 transition-colors hover:bg-muted/55 focus-within:bg-muted/55 sm:gap-x-4 sm:px-5"
>
	<Checkbox
		checked={selected}
		onCheckedChange={handleCheckedChange}
		aria-label={`Pilih ${paper.title}`}
		class="mt-1 size-5 shrink-0"
	/>

	<div class="min-w-0">
		<div class="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3">
			<div class="min-w-[min(100%,28rem)] flex-1">
				<div class="mb-2 flex flex-wrap items-center gap-1.5">
					{#if paper.isOpenAccess}<Badge variant="chip-mint">Open access</Badge>{/if}
					{#if workTypeLabel}<Badge variant="outline">{workTypeLabel}</Badge>{/if}
					{#if paper.isRetracted}
						<span
							class="inline-flex items-center gap-1 rounded-sm bg-destructive/10 px-2 py-1 text-label font-semibold text-destructive"
							><Icon icon={AlertCircleIcon} class="size-3" />Paper ditarik</span
						>
					{/if}
				</div>
				<h3 class="text-[15px] leading-5 font-semibold text-foreground sm:text-base">
					<a
						href={readerHref}
						class="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						>{paper.title}</a
					>
				</h3>
			</div>

			<div
				role="group"
				aria-label={`Tindakan untuk ${paper.title}`}
				class="flex shrink-0 items-center gap-1.5"
			>
				<SaveSourceButton source={saveInput} label="Simpan" variant="outline" size="sm" />
				{#if paper.url}
					<a
						href={paper.url}
						target="_blank"
						rel="noreferrer"
						aria-label="Buka sumber asli"
						class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						><Icon icon={ExternalLinkIcon} class="size-3.5" /></a
					>
				{/if}
			</div>
		</div>

		{#if metaLine}<p class="mt-2 text-label text-muted-foreground">{metaLine}</p>{/if}
		{#if paper.snippet}<p class="mt-2 max-w-[75ch] text-[13px] leading-5 text-ink-soft">
				{paper.snippet}
			</p>{/if}

		<div
			class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/70 pt-3 text-label text-muted-foreground"
		>
			{#if citationLabel}<span class="tabular-nums">{citationLabel}</span>{/if}
			{#if paper.hasPdf}<span class="inline-flex items-center gap-1"
					><Icon icon={FileTextIcon} class="size-3" />PDF tersedia</span
				>{/if}
		</div>
	</div>
</article>
