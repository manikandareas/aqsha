<script lang="ts">
	import { cn } from '$lib/utils';
	import { Icon, FileIcon, Loader2Icon } from '$lib/icons';
	import * as Tabs from '$lib/components/ui/tabs';
	import Response from '$lib/components/ai-elements/Response.svelte';
	import type { ArtifactRenderPayload } from '$lib/features/artifacts/types';
	import MermaidArtifactViewer from './MermaidArtifactViewer.svelte';
	// PdfArtifactViewer is created by the route/caller; it takes a `url: string` prop.
	import PdfArtifactViewer from './PdfArtifactViewer.svelte';

	/**
	 * Artifact reading column (`ArtifactReadingColumn` + internal viewers: url / pdf / docx / html / svg /
	 * mermaid / json / csv / plain_text / code). Content-first types read as documents; framed embedded
	 * viewers share one `ArtifactSurface` shell + height. Markdown is handled upstream in `ArtifactDetailView`
	 * (read-only prose; editing deferred to the editor redesign), so it is excluded from this union.
	 *
	 * Code / source rendering is delegated to svelte-streamdown via `Response` (fenced code block) —
	 * its built-in syntax highlight + copy control replace a bespoke `CodeBlock` component.
	 */
	type NonMarkdownPayload = Exclude<ArtifactRenderPayload, { artifactType: 'markdown' }>;

	let { payload, title }: { payload: NonMarkdownPayload; title: string } = $props();

	const ARTIFACT_SURFACE_CLASS =
		'overflow-hidden rounded-[10px] border border-border/80 bg-card/40';
	// One height for every framed embedded viewer (html/svg/diagram/code/source).
	const VIEWER_HEIGHT_CLASS = 'h-[64svh] min-h-[480px]';
	const tabsListClass =
		'h-10 w-full justify-start gap-5 rounded-none border-0 border-b border-border bg-transparent p-0';
	const tabsTriggerClass =
		'h-10 min-w-0 gap-2 rounded-none border-b-2 border-transparent bg-transparent px-0 text-[13px] font-semibold text-muted-foreground shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none';

	function formatByteSize(size: number) {
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

	function parseJsonSource(source: string): { pretty: string; error: string | null } {
		try {
			return { pretty: JSON.stringify(JSON.parse(source), null, 2), error: null };
		} catch (error: unknown) {
			return { pretty: source, error: error instanceof Error ? error.message : 'Invalid JSON.' };
		}
	}

	function sourceLineCount(source: string) {
		if (!source) return 0;
		return source.split(/\r\n|\r|\n/).length;
	}

	function jsonValueSummary(value: unknown): string {
		if (Array.isArray(value)) return `${value.length} items`;
		if (value && typeof value === 'object') return `${Object.keys(value).length} keys`;
		return typeof value;
	}

	function jsonPreviewRows(value: unknown, path = '$'): Array<{ path: string; value: string }> {
		if (Array.isArray(value)) {
			if (value.length === 0) return [{ path, value: '[]' }];
			return value.flatMap((item, index) => jsonPreviewRows(item, `${path}[${index}]`));
		}
		if (value && typeof value === 'object') {
			const entries = Object.entries(value as Record<string, unknown>);
			if (entries.length === 0) return [{ path, value: '{}' }];
			return entries.flatMap(([key, entryValue]) => jsonPreviewRows(entryValue, `${path}.${key}`));
		}
		return [{ path, value: String(value) }];
	}

	function parseCsvPreview(source: string) {
		return source
			.split(/\r\n|\r|\n/)
			.filter((line) => line.trim().length > 0)
			.slice(0, 12)
			.map((line) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')));
	}

	function csvColumnKey(cell: string | undefined, columnIndex: number) {
		return cell ? `column:${cell}` : `column:${columnIndex + 1}`;
	}

	function csvRowKey(row: string[], rowIndex: number) {
		const content = row.join('');
		return content ? `row:${content}` : `row:${rowIndex + 1}`;
	}

	function normalizeCodeBlockLanguage(language: string): string {
		const normalized = language.toLowerCase();
		if (normalized === 'plain_text' || normalized === 'text' || normalized === 'txt') return 'log';
		if (normalized === 'code') return 'log';
		if (normalized === 'mermaid') return 'mermaid';
		if (normalized === 'javascript' || normalized === 'js') return 'javascript';
		if (normalized === 'typescript' || normalized === 'ts') return 'typescript';
		if (normalized === 'tsx') return 'tsx';
		if (normalized === 'jsx') return 'jsx';
		if (normalized === 'html') return 'html';
		if (normalized === 'svg' || normalized === 'xml') return 'xml';
		if (normalized === 'json') return 'json';
		if (normalized === 'csv') return 'csv';
		if (normalized === 'css') return 'css';
		if (normalized === 'markdown' || normalized === 'md') return 'markdown';
		return 'log';
	}

	// Wrap raw source in a code fence long enough to survive any backtick run inside it, so
	// svelte-streamdown renders it as a single highlighted block (never re-parsing the body).
	function fencedCode(source: string, language: string): string {
		const runs = source.match(/`+/g) ?? [];
		const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
		const fence = '`'.repeat(Math.max(3, longest + 1));
		return `${fence}${language}\n${source || 'No source content.'}\n${fence}`;
	}

	function buildSandboxedHtmlDocument(source: string) {
		const csp =
			'<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data: blob: https:; style-src &#39;unsafe-inline&#39;; font-src data:; script-src &#39;none&#39;; connect-src &#39;none&#39;; frame-src &#39;none&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">';
		const base = '<base target="_blank">';
		const viewportStyle =
			'<style>html,body{min-height:100%;margin:0;}body{box-sizing:border-box;}*,*::before,*::after{box-sizing:inherit;}</style>';

		if (/<html[\s>]/i.test(source)) {
			if (/<head[\s>]/i.test(source)) {
				return source.replace(/<head([^>]*)>/i, `<head$1>${csp}${base}${viewportStyle}`);
			}
			return source.replace(/<html([^>]*)>/i, `<html$1><head>${csp}${base}${viewportStyle}</head>`);
		}

		return `<!doctype html><html><head>${csp}${base}${viewportStyle}</head><body>${source}</body></html>`;
	}

	function buildSandboxedSvgDocument(source: string) {
		const csp =
			'<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data: blob:; style-src &#39;unsafe-inline&#39;; font-src data:; script-src &#39;none&#39;; connect-src &#39;none&#39;; base-uri &#39;none&#39;">';
		const svgSource = source.replace(/<svg\b([^>]*)>/i, (_match, attributes: string) => {
			const normalizedAttributes = String(attributes)
				.replace(/\s(width|height)=["'][^"']*["']/gi, '')
				.replace(/\s(width|height)=\S+/gi, '');
			return `<svg${normalizedAttributes} width="100%" height="100%">`;
		});

		return `<!doctype html><html><head>${csp}<style>html,body{height:100%;margin:0;}body{display:grid;place-items:center;overflow:auto;background:transparent;}svg{display:block;max-width:100%;max-height:100%;}</style></head><body>${svgSource}</body></html>`;
	}
</script>

{#snippet sourceBlock(source: string, language: string)}
	<div class={cn(ARTIFACT_SURFACE_CLASS, VIEWER_HEIGHT_CLASS, 'relative flex flex-col')}>
		<div class="min-h-0 flex-1 overflow-auto p-3">
			<Response
				text={fencedCode(source, normalizeCodeBlockLanguage(language))}
				class="max-w-none"
			/>
		</div>
	</div>
{/snippet}

{#if payload.artifactType === 'url'}
	{#if payload.status === 'pending'}
		<div
			class="flex min-h-[360px] items-center justify-center gap-2 text-[13px] font-medium text-muted-foreground"
		>
			<Icon icon={Loader2Icon} class="size-4 animate-spin" />
			Reading this page…
		</div>
	{:else if payload.status === 'failed'}
		<p
			class="rounded-[8px] border border-destructive/30 bg-destructive/5 p-3 text-[13px] font-medium text-destructive"
		>
			{payload.failureReason ?? "We couldn't read this page."}
		</p>
	{:else}
		<article class="artifact-prose min-h-[420px] whitespace-pre-wrap">
			{payload.readableText || 'No readable text was extracted.'}
		</article>
	{/if}
{:else if payload.artifactType === 'pdf'}
	<PdfArtifactViewer url={payload.url} />
{:else if payload.artifactType === 'docx'}
	<div
		class={cn(
			ARTIFACT_SURFACE_CLASS,
			'grid min-h-[420px] place-items-center gap-3 p-8 text-center'
		)}
	>
		<Icon icon={FileIcon} class="size-10 text-muted-foreground" />
		<div class="grid gap-1">
			<p class="text-[14px] font-semibold text-foreground">{title}</p>
			<p class="text-[12px] font-medium text-muted-foreground">
				{payload.fileName} / {formatByteSize(payload.byteSize)}
			</p>
			<p class="text-[12px] font-medium text-muted-foreground">
				Open or download this document from the actions above.
			</p>
		</div>
	</div>
{:else if payload.artifactType === 'image'}
	<!-- Image artifacts render from a direct object-storage URL (no inline text payload). -->
	<div class={cn(ARTIFACT_SURFACE_CLASS, VIEWER_HEIGHT_CLASS, 'grid place-items-center p-4')}>
		<img src={payload.url} alt={title} class="max-h-full max-w-full object-contain" />
	</div>
{:else if payload.artifactType === 'html'}
	<div class={ARTIFACT_SURFACE_CLASS}>
		<iframe
			title="HTML preview"
			sandbox=""
			srcdoc={buildSandboxedHtmlDocument(payload.source)}
			class={cn('w-full border-0 bg-background', VIEWER_HEIGHT_CLASS)}
		></iframe>
	</div>
{:else if payload.artifactType === 'svg'}
	<div class={ARTIFACT_SURFACE_CLASS}>
		<iframe
			title="SVG preview"
			sandbox=""
			srcdoc={buildSandboxedSvgDocument(payload.source)}
			class={cn('w-full border-0 bg-background', VIEWER_HEIGHT_CLASS)}
		></iframe>
	</div>
{:else if payload.artifactType === 'mermaid'}
	<div class={cn(ARTIFACT_SURFACE_CLASS, VIEWER_HEIGHT_CLASS)}>
		<MermaidArtifactViewer source={payload.source} />
	</div>
{:else if payload.artifactType === 'json'}
	{@const parsed = parseJsonSource(payload.source)}
	<Tabs.Root value="viewer" class="gap-0">
		<Tabs.List class={tabsListClass}>
			<Tabs.Trigger value="viewer" class={tabsTriggerClass}>Viewer</Tabs.Trigger>
			<Tabs.Trigger value="source" class={tabsTriggerClass}>Source</Tabs.Trigger>
		</Tabs.List>
		<Tabs.Content value="viewer" class="pt-6">
			{#if parsed.error}
				<div
					class={cn(
						ARTIFACT_SURFACE_CLASS,
						'grid min-h-[260px] place-items-center p-8 text-center'
					)}
				>
					<div class="grid max-w-sm gap-2">
						<h2 class="text-[14px] font-semibold text-foreground">JSON preview unavailable</h2>
						<p class="text-[12px] leading-5 text-muted-foreground">
							{sourceLineCount(payload.source)} lines / {formatByteSize(
								new Blob([payload.source]).size
							)}
						</p>
					</div>
				</div>
			{:else}
				{@const value = JSON.parse(payload.source)}
				{@const rows = jsonPreviewRows(value).slice(0, 24)}
				<div class={ARTIFACT_SURFACE_CLASS}>
					<div class="flex items-center justify-between border-b border-border/70 px-3 py-2">
						<h2 class="text-[13px] font-semibold text-foreground">JSON viewer</h2>
						<span class="text-[11px] font-medium text-muted-foreground"
							>{jsonValueSummary(value)}</span
						>
					</div>
					<div class="divide-y divide-border/60">
						{#each rows as row (row.path)}
							<div
								class="grid gap-1 px-3 py-2 @2xl:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)] @2xl:gap-4"
							>
								<span class="truncate font-mono text-[12px] text-muted-foreground">{row.path}</span>
								<span class="truncate text-[12px] font-medium text-foreground">{row.value}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</Tabs.Content>
		<Tabs.Content value="source" class="pt-6">
			{@render sourceBlock(payload.source, 'json')}
		</Tabs.Content>
	</Tabs.Root>
{:else if payload.artifactType === 'csv'}
	{@const rows = parseCsvPreview(payload.source)}
	{@const header = rows[0] ?? []}
	{@const body = rows.slice(1, 11)}
	<Tabs.Root value="viewer" class="gap-0">
		<Tabs.List class={tabsListClass}>
			<Tabs.Trigger value="viewer" class={tabsTriggerClass}>Viewer</Tabs.Trigger>
			<Tabs.Trigger value="source" class={tabsTriggerClass}>Source</Tabs.Trigger>
		</Tabs.List>
		<Tabs.Content value="viewer" class="pt-6">
			<div class={ARTIFACT_SURFACE_CLASS}>
				<div class="flex items-center justify-between border-b border-border/70 px-3 py-2">
					<h2 class="text-[13px] font-semibold text-foreground">CSV viewer</h2>
					<span class="text-[11px] font-medium text-muted-foreground">
						{Math.max(rows.length - 1, 0)} rows / {header.length} columns
					</span>
				</div>
				<div class="overflow-auto">
					<table class="w-full min-w-[640px] border-collapse text-left text-[12px]">
						<thead class="bg-muted/35 text-muted-foreground">
							<tr>
								{#each header as cell, columnIndex (csvColumnKey(cell, columnIndex))}
									<th class="border-b border-border px-3 py-2 font-semibold">
										{cell || `Column ${columnIndex + 1}`}
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each body as row, rowIndex (csvRowKey(row, rowIndex))}
								<tr class="border-b border-border/60 last:border-b-0">
									{#each header as headerCell, cellIndex (csvColumnKey(headerCell, cellIndex))}
										<td class="max-w-72 truncate px-3 py-2 text-foreground"
											>{row[cellIndex] ?? ''}</td
										>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</Tabs.Content>
		<Tabs.Content value="source" class="pt-6">
			{@render sourceBlock(payload.source, 'csv')}
		</Tabs.Content>
	</Tabs.Root>
{:else if payload.artifactType === 'plain_text'}
	<article class="artifact-prose min-h-[360px] whitespace-pre-wrap">
		{payload.source || 'No text content.'}
	</article>
{:else if 'source' in payload}
	{@render sourceBlock(payload.source, payload.language ?? 'code')}
{/if}
