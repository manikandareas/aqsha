<script lang="ts" module>
	/**
	 * Raw artifact record surfaced to the metadata panel (the `.artifact` sub-object of the artifact
	 * detail query).
	 */
	export type ArtifactSidebarRecord = {
		artifactType: string;
		artifactFamily?: string;
		source?: string;
		language?: string | null;
		mimeType?: string | null;
		fileName?: string | null;
		byteSize?: number | null;
		indexingStatus?: 'not_indexed' | 'pending' | 'ready' | 'failed';
		indexingFailureReason?: string | null;
		detectedDocumentKind?: 'generic' | 'scholarly_paper' | null;
		indexedAt?: number | null;
		createdAt: number;
		updatedAt: number;
	};
</script>

<script lang="ts">
	import { cn } from '@aqsha/ui-svelte/utils';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import {
		Icon,
		AlertCircleIcon,
		ChevronRightIcon,
		ExternalLinkIcon,
		Loader2Icon,
		RotateCcwIcon
	} from '$lib/icons';
	import CopyCitationButton from '$lib/components/citation/CopyCitationButton.svelte';
	import {
		formatCitation,
		type CitationFormat,
		type CitationInput
	} from '$lib/features/artifacts/utils/citation';
	import type { ArtifactRenderPayload } from '$lib/features/artifacts/types';
	import {
		derivePaperMetadataView,
		type PaperExtractionStatus
	} from '$lib/features/workspaces/utils/paper-metadata-model';

	/**
	 * Full artifact metadata panel (About / Cite / Details), with the inline extraction banner
	 * (`PaperStatusBanner`) and shared `PropertyRow` / `PropertyLink` render shapes inlined as snippets.
	 * Retry actions are pre-bound to the active artifact by the data hook (`useArtifactDetailData`), so
	 * no `artifactId` needs threading through.
	 */
	type NonMarkdownPayload = Exclude<ArtifactRenderPayload, { artifactType: 'markdown' }>;
	type PaperMetadata = NonNullable<NonNullable<PaperExtractionStatus>['metadata']>;

	// eslint-disable-next-line svelte/no-unused-props -- `artifact` is the shared ArtifactSidebarRecord shape; not every field (artifactType/artifactFamily/detectedDocumentKind) surfaces in this panel
	let {
		artifact,
		payload,
		title,
		paperExtraction,
		retryGrobidExtraction,
		retryUrlExtraction
	}: {
		artifact: ArtifactSidebarRecord;
		payload: NonMarkdownPayload;
		title: string;
		paperExtraction?: PaperExtractionStatus;
		retryGrobidExtraction: () => Promise<unknown>;
		retryUrlExtraction: () => Promise<unknown>;
	} = $props();

	const citationFormats: Array<{ value: CitationFormat; label: string }> = [
		{ value: 'bibtex', label: 'BibTeX' },
		{ value: 'markdown', label: 'Markdown' },
		{ value: 'plain', label: 'Plain text' }
	];

	let showDetails = $state(false);
	let abstractExpanded = $state(false);

	const isPdf = $derived(payload.artifactType === 'pdf');
	const view = $derived(derivePaperMetadataView({ isPdf, paperExtraction }));
	const metadata = $derived(view.metadata);
	const urlPayload = $derived(payload.artifactType === 'url' ? payload : null);
	const filePayload = $derived(
		payload.artifactType === 'pdf' || payload.artifactType === 'docx' ? payload : null
	);
	const authors = $derived(
		metadata ? metadata.authors.flatMap((author) => (author.name ? [author.name] : [])) : []
	);
	const formatValue = $derived(artifact.mimeType ?? artifact.language);

	// Extraction banner state (`PaperStatusBanner`).
	const urlFailed = $derived(payload.artifactType === 'url' && payload.status === 'failed');
	const showBanner = $derived(view.paperPending || view.paperFailed || urlFailed);

	const abstractIsLong = $derived(metadata?.abstract ? metadata.abstract.length > 320 : false);

	function friendlyTypeLabel(artifactType: string) {
		switch (artifactType) {
			case 'markdown':
				return 'Document';
			case 'plain_text':
				return 'Note';
			case 'code':
				return 'Code';
			case 'pdf':
				return 'PDF';
			case 'docx':
				return 'Word doc';
			case 'html':
				return 'Web page';
			case 'svg':
				return 'Image';
			case 'image':
				return 'Image';
			case 'mermaid':
				return 'Diagram';
			case 'json':
				return 'Data';
			case 'csv':
				return 'Table';
			case 'spreadsheet':
				return 'Excel';
			case 'url':
				return 'Web link';
			default:
				return 'Artifact';
		}
	}

	function addedLabel(source: string | undefined, createdAt: number) {
		const verb =
			source === 'upload'
				? 'Uploaded'
				: source === 'agent'
					? 'Added by the agent'
					: source === 'url'
						? 'Saved'
						: 'Created';
		return `${verb} · ${formatDate(createdAt)}`;
	}

	function journalLabel(m: PaperMetadata) {
		if (m.publishedYear) return `${m.journal} (${m.publishedYear})`;
		return m.journal ?? '';
	}

	function paperCitationInput(
		m: PaperMetadata,
		fallbackTitle: string,
		fallbackUrl: string
	): CitationInput {
		return {
			title: m.title ?? fallbackTitle,
			authors: m.authors.flatMap((author) => (author.name ? [author.name] : [])),
			url: m.doi ? `https://doi.org/${m.doi}` : fallbackUrl,
			doi: m.doi,
			year: m.publishedYear,
			venue: m.journal ?? m.publisher
		};
	}

	function indexingDisplay(status?: 'not_indexed' | 'pending' | 'ready' | 'failed') {
		switch (status) {
			case 'ready':
				return { label: 'Indexed', tone: 'bg-mint-foreground' };
			case 'pending':
				return { label: 'Indexing', tone: 'bg-lemon-foreground' };
			case 'failed':
				return { label: 'Indexing failed', tone: 'bg-destructive' };
			default:
				return { label: 'Not indexed', tone: 'bg-muted-foreground/50' };
		}
	}

	function formatDate(timestamp: number) {
		return new Date(timestamp).toLocaleDateString('en', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatBytes(size: number) {
		if (!Number.isFinite(size) || size <= 0) return 'Unknown size';
		const units = ['B', 'KB', 'MB', 'GB'];
		let value = size;
		let unitIndex = 0;
		while (value >= 1024 && unitIndex < units.length - 1) {
			value /= 1024;
			unitIndex += 1;
		}
		return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
	}

	function shortenLocator(value: string) {
		return value.replace(/^https?:\/\//i, '').replace(/^doi\.org\//i, '');
	}
</script>

{#snippet propertyRow(label: string, value: string, badge = false)}
	<div>
		<dt class="text-[12px] font-medium text-muted-foreground">{label}</dt>
		<dd
			class="mt-1.5 flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-foreground"
			title={value}
		>
			{#if badge}
				<span class="min-w-0 truncate rounded-md bg-muted px-2 py-0.5 text-[13px] font-semibold">
					{value}
				</span>
			{:else}
				<span class="min-w-0 truncate">{value}</span>
			{/if}
		</dd>
	</div>
{/snippet}

{#snippet propertyLink(label: string, value: string, href: string)}
	<div>
		<dt class="text-[12px] font-medium text-muted-foreground">{label}</dt>
		<dd class="mt-1.5 min-w-0">
			<a
				{href}
				target="_blank"
				rel="noreferrer"
				class="inline-flex max-w-full items-center gap-1 text-[13px] font-medium text-sky-foreground hover:underline"
				title={value}
			>
				<span class="truncate">{value}</span>
				<Icon icon={ExternalLinkIcon} class="size-3.5 shrink-0" />
			</a>
		</dd>
	</div>
{/snippet}

{#snippet indexStatusRow(status: ArtifactSidebarRecord['indexingStatus'], reason?: string | null)}
	{@const display = indexingDisplay(status)}
	<div>
		<dt class="text-[12px] font-medium text-muted-foreground">Index</dt>
		<dd class="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-foreground">
			{#if status === 'pending'}
				<Icon icon={Loader2Icon} class="size-3.5 animate-spin text-muted-foreground" />
			{:else}
				<span class={cn('size-1.5 rounded-full', display.tone)}></span>
			{/if}
			{display.label}
		</dd>
		{#if status === 'failed' && reason}
			<p class="mt-1 text-[12px] leading-5 text-destructive">{reason}</p>
		{/if}
	</div>
{/snippet}

{#snippet statusPending(message: string)}
	<div
		class="flex items-center gap-2 rounded-[8px] border border-border bg-muted/40 p-3 text-[12px] font-medium text-muted-foreground"
	>
		<Icon icon={Loader2Icon} class="size-3.5 shrink-0 animate-spin" />
		{message}
	</div>
{/snippet}

{#snippet statusFailure(message: string, onRetry: () => void)}
	<div
		class="flex items-start justify-between gap-2 rounded-[8px] border border-destructive/30 bg-destructive/5 p-3"
	>
		<p class="inline-flex items-start gap-1.5 text-[12px] font-medium text-destructive">
			<Icon icon={AlertCircleIcon} class="mt-0.5 size-3.5 shrink-0" />
			{message}
		</p>
		<Button
			type="button"
			variant="ghost"
			size="xs"
			class="shrink-0 gap-1 px-1.5 text-muted-foreground"
			onclick={onRetry}
		>
			<Icon icon={RotateCcwIcon} class="size-3.5" />
			Retry
		</Button>
	</div>
{/snippet}

<div class="space-y-5">
	{#if showBanner}
		<div class="space-y-3">
			{#if view.paperFailed}
				{@render statusFailure("We couldn't read this paper's details.", () => {
					void retryGrobidExtraction();
				})}
			{/if}
			{#if urlFailed}
				{@render statusFailure("We couldn't read this page.", () => {
					void retryUrlExtraction();
				})}
			{/if}
			{#if view.paperPending}
				{@render statusPending('Reading paper details…')}
			{/if}
		</div>
	{/if}

	<section>
		<h2 class="mb-4 text-[12px] font-semibold text-muted-foreground">About</h2>
		<div class="space-y-4">
			{@render propertyRow('Type', friendlyTypeLabel(payload.artifactType), true)}
			{@render propertyRow('Added', addedLabel(artifact.source, artifact.createdAt))}
			{@render indexStatusRow(artifact.indexingStatus, artifact.indexingFailureReason)}

			{#if authors.length > 0}
				{@render propertyRow('Authors', authors.join(', '))}
			{/if}
			{#if metadata?.journal}
				{@render propertyRow('Journal', journalLabel(metadata))}
			{/if}
			{#if metadata?.doi}
				{@render propertyLink('DOI', metadata.doi, `https://doi.org/${metadata.doi}`)}
			{/if}

			{#if urlPayload?.siteName}
				{@render propertyRow('Site', urlPayload.siteName)}
			{/if}
			{#if urlPayload}
				{@render propertyLink(
					'Link',
					shortenLocator(urlPayload.normalizedUrl),
					urlPayload.normalizedUrl
				)}
			{/if}
		</div>

		{#if metadata && metadata.keywords.length > 0}
			<div class="mt-4 flex flex-wrap gap-2">
				{#each metadata.keywords.slice(0, 6) as keyword (keyword)}
					<span
						class="rounded-md bg-lemon-soft px-2 py-1 text-xs font-semibold text-lemon-foreground"
					>
						{keyword}
					</span>
				{/each}
			</div>
		{/if}

		{#if urlPayload?.description}
			<p class="mt-4 text-[13px] leading-6 text-muted-foreground">{urlPayload.description}</p>
		{/if}
	</section>

	{#if metadata?.abstract}
		<section class="border-t border-border pt-4">
			<h2 class="mb-2 text-[12px] font-semibold text-muted-foreground">Abstract</h2>
			<p
				class={cn(
					'text-[13px] leading-6 text-foreground',
					!abstractExpanded && abstractIsLong && 'line-clamp-6'
				)}
			>
				{metadata.abstract}
			</p>
			{#if abstractIsLong}
				<button
					type="button"
					onclick={() => (abstractExpanded = !abstractExpanded)}
					class="mt-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
				>
					{abstractExpanded ? 'Show less' : 'Show more'}
				</button>
			{/if}
		</section>
	{/if}

	{#if metadata}
		<section class="border-t border-border pt-4">
			<h2 class="mb-3 text-[12px] font-semibold text-muted-foreground">Cite</h2>
			<div class="space-y-2">
				{#each citationFormats as format (format.value)}
					<CopyCitationButton
						value={formatCitation(
							paperCitationInput(
								metadata,
								title,
								filePayload?.url ?? urlPayload?.normalizedUrl ?? ''
							),
							format.value
						)}
						children={format.label}
					/>
				{/each}
			</div>
		</section>
	{/if}

	<section class="border-t border-border pt-4">
		<button
			type="button"
			onclick={() => (showDetails = !showDetails)}
			class="flex w-full items-center gap-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
			aria-expanded={showDetails}
		>
			<Icon
				icon={ChevronRightIcon}
				class={cn('size-3.5 transition-transform', showDetails && 'rotate-90')}
			/>
			Details
		</button>
		{#if showDetails}
			<div class="mt-4 space-y-4">
				{#if formatValue}
					{@render propertyRow('Format', formatValue)}
				{/if}
				{#if typeof artifact.byteSize === 'number' && artifact.byteSize > 0}
					{@render propertyRow('Size', formatBytes(artifact.byteSize))}
				{/if}
				{#if artifact.fileName}
					{@render propertyRow('File', artifact.fileName)}
				{/if}
				{@render propertyRow('Last updated', formatDate(artifact.updatedAt))}
				{#if artifact.indexedAt}
					{@render propertyRow('Indexed', formatDate(artifact.indexedAt))}
				{/if}
				{#if typeof metadata?.confidence === 'number'}
					{@render propertyRow('Metadata confidence', `${Math.round(metadata.confidence * 100)}%`)}
				{/if}
				{#if metadata && metadata.affiliations.length > 0}
					{@render propertyRow('Affiliations', metadata.affiliations.join(', '))}
				{/if}
				{#if urlPayload && urlPayload.originalUrl !== urlPayload.normalizedUrl}
					{@render propertyLink(
						'Original link',
						shortenLocator(urlPayload.originalUrl),
						urlPayload.originalUrl
					)}
				{/if}
				{#if urlPayload?.title}
					{@render propertyRow('Page title', urlPayload.title)}
				{/if}
			</div>
		{/if}
	</section>
</div>
