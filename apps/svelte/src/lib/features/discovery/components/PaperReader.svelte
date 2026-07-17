<script lang="ts">
	import { Icon, BookOpenIcon, DownloadIcon, UserRoundIcon } from '$lib/icons';
	import GenerativeCover from '$lib/components/GenerativeCover.svelte';
	import { usePaper, useRecordInteraction } from '../api';
	import { formatCitationCount } from '../format';
	import type { PaperEnrichmentRef } from '../types';
	import PaperAside from './PaperAside.svelte';
	import SaveToWorkspaceButton from './SaveToWorkspaceButton.svelte';
	import {
		Eyebrow,
		ExpandableText,
		PillCta,
		ReaderEmpty,
		ReaderLoader,
		ReaderSection,
		ReaderShell
	} from './reader-ui';

	/**
	 * Paper reader: getPaperDetail(key) → header + actions + metrics + abstract + references + fact-sheet.
	 */
	let { paperKey }: { paperKey: string } = $props();

	const query = usePaper(() => paperKey);
	const record = useRecordInteraction();
	const paper = $derived(query.data);

	// Internal reader href for a related paper (DOI → in-app reader `doi:…`), byte-identical to web
	// (`encodeURIComponent`); the discovery glob turns the resolve() rule off (external refs alongside).
	function relatedInternalHref(r: PaperEnrichmentRef): string | null {
		return r.doi ? `/app/explore/${encodeURIComponent(`doi:${r.doi}`)}` : null;
	}
	function refMeta(r: PaperEnrichmentRef): string {
		return [
			r.year ? String(r.year) : null,
			r.citedByCount != null ? formatCitationCount(r.citedByCount) : null
		]
			.filter(Boolean)
			.join(' · ');
	}
</script>

<ReaderShell width="wide">
	{#if query.isPending}
		<ReaderLoader />
	{:else if !paper}
		<ReaderEmpty
			title="Paper ini belum bisa ditampilkan"
			message="Kami belum berhasil menarik detailnya. Coba buka sumber aslinya, atau kembali ke Jelajahi."
		/>
	{:else}
		{@const downloadHref = paper.pdfUrl ?? paper.enriched?.oaUrl}
		{@const meta = [paper.enriched?.journal ?? paper.venue, paper.year ? String(paper.year) : null]
			.filter(Boolean)
			.join(' · ')}
		<article class="mt-7">
			<header class="max-w-3xl">
				<div class="flex flex-wrap items-center gap-2">
					<Eyebrow tone="mint">
						{#snippet icon()}<Icon icon={BookOpenIcon} class="size-3" />{/snippet}
						Paper · {paper.provider}
					</Eyebrow>
					{#if paper.isOpenAccess}<Eyebrow tone="lemon">Akses terbuka</Eyebrow>{/if}
				</div>
				<h1
					class="mt-4 font-serif text-[28px] leading-[1.12] tracking-tight text-foreground @2xl:text-[40px]"
				>
					{paper.title}
				</h1>
				{#if paper.authors.length > 0}
					<p class="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
						<Icon icon={UserRoundIcon} class="size-3.5 shrink-0" />
						<span class="line-clamp-2">{paper.authors.join(', ')}</span>
					</p>
				{/if}
				{#if meta}<p class="mt-1 text-sm text-muted-foreground">{meta}</p>{/if}
			</header>

			<div class="mt-6 flex flex-wrap items-center gap-2.5">
				{#if downloadHref}
					<PillCta href={downloadHref}>
						{#snippet icon()}<Icon icon={DownloadIcon} class="size-4" />{/snippet}
						Unduh PDF
					</PillCta>
				{/if}
				<PillCta href={paper.url} variant={downloadHref ? 'outline' : 'solid'}>
					Lihat di penerbit
				</PillCta>
				<SaveToWorkspaceButton
					url={paper.url}
					title={paper.title}
					label="Simpan"
					size="sm"
					variant="ghost"
					class="rounded-full text-muted-foreground hover:text-foreground"
					onSaved={() =>
						record.mutate({ itemRef: { kind: 'paper', paperKey: paper.key }, kind: 'save' })}
				/>
			</div>

			<div class="mt-8 grid grid-cols-1 gap-x-12 gap-y-2 @5xl:grid-cols-[minmax(0,1fr)_18rem]">
				<div class="min-w-0">
					{#if paper.abstract || paper.snippet}
						<ReaderSection title="Abstrak">
							<ExpandableText text={paper.abstract ?? paper.snippet ?? ''} clampLines={10} />
						</ReaderSection>
					{/if}

					{#if paper.enriched && paper.enriched.references.length > 0}
						<ReaderSection title="Referensi" count={paper.enriched.referencedCount || undefined}>
							{@render refList(paper.enriched.references)}
						</ReaderSection>
					{/if}

					{#if paper.enriched && paper.enriched.citedBy.length > 0}
						<ReaderSection title="Dikutip oleh">
							{@render refList(paper.enriched.citedBy)}
						</ReaderSection>
					{/if}

					{#if paper.enriched && paper.enriched.related.length > 0}
						<ReaderSection title="Paper terkait">
							<div class="grid grid-cols-2 gap-x-5 gap-y-7 @2xl:grid-cols-3">
								{#each paper.enriched.related.slice(0, 6) as r (r.openalexId)}
									{@render relatedPaperCard(r)}
								{/each}
							</div>
						</ReaderSection>
					{/if}
				</div>

				<PaperAside {paper} />
			</div>
		</article>
	{/if}
</ReaderShell>

{#snippet refList(refs: PaperEnrichmentRef[])}
	<ul class="divide-y divide-border/50 overflow-hidden rounded-2xl border-2 border-border">
		{#each refs as r (r.openalexId)}
			<li>
				<a
					href={r.doi ? `https://doi.org/${r.doi}` : `https://openalex.org/${r.openalexId}`}
					target="_blank"
					rel="noopener noreferrer"
					class="group flex flex-col gap-1 px-4 py-3 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-muted/40"
				>
					<span
						class="text-sm leading-snug text-foreground underline-offset-2 group-hover:underline"
					>
						{r.title}
					</span>
					<span class="text-[12px] text-muted-foreground">{refMeta(r)}</span>
				</a>
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet relatedPaperCard(r: PaperEnrichmentRef)}
	{@const internalHref = relatedInternalHref(r)}
	{@const externalHref = `https://openalex.org/${r.openalexId}`}
	<article class="group flex flex-col">
		{#if internalHref}
			<a
				href={internalHref}
				class="block overflow-hidden rounded-[12px]"
				aria-hidden="true"
				tabindex={-1}
			>
				<div
					class="relative aspect-[16/10] w-full transition-opacity duration-200 group-hover:opacity-90"
				>
					<GenerativeCover title={r.title} label="Paper" />
				</div>
			</a>
		{:else}
			<a
				href={externalHref}
				target="_blank"
				rel="noopener noreferrer"
				class="block overflow-hidden rounded-[12px]"
				aria-hidden="true"
				tabindex={-1}
			>
				<div
					class="relative aspect-[16/10] w-full transition-opacity duration-200 group-hover:opacity-90"
				>
					<GenerativeCover title={r.title} label="Paper" />
				</div>
			</a>
		{/if}

		<div class="flex min-w-0 flex-1 flex-col pt-2.5">
			<h3 class="font-heading text-[15px] font-bold leading-[1.25] tracking-tight text-foreground">
				{#if internalHref}
					<a
						href={internalHref}
						class="line-clamp-3 break-words underline-offset-4 hover:underline"
					>
						{r.title}
					</a>
				{:else}
					<a
						href={externalHref}
						target="_blank"
						rel="noopener noreferrer"
						class="line-clamp-3 break-words underline-offset-4 hover:underline"
					>
						{r.title}
					</a>
				{/if}
			</h3>
			{#if refMeta(r)}
				<p class="mt-2 text-[12px] font-medium text-muted-foreground">{refMeta(r)}</p>
			{/if}
		</div>
	</article>
{/snippet}
