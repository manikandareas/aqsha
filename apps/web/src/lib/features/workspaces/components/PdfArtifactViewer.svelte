<script lang="ts">
	import { browser } from '$app/environment';
	import type { PDFDocumentProxy } from 'pdfjs-dist';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { cn } from '@aqsha/ui-svelte/utils';
	import PdfPageCanvas from './PdfPageCanvas.svelte';
	import {
		Icon,
		AlertCircleIcon,
		ArrowUpToLineIcon,
		ChevronDownIcon,
		ChevronUpIcon,
		Loader2Icon,
		MaximizeIcon,
		MinimizeIcon,
		MinusIcon,
		PlusIcon,
		SearchIcon,
		XIcon
	} from '$lib/icons';

	/**
	 * PDF artifact reader. Rendered directly via `pdfjs-dist` (react-pdf has no Svelte build) — canvas per page (lazy), a
	 * shadcn-svelte-skinned floating toolbar (zoom / page nav / fullscreen / find), and full-document
	 * text search that scrolls to matching pages. Browser-only (dynamic import behind `browser`).
	 *
	 * The react-pdf text-selection layer, native annotation-link layer, and in-text citation/search
	 * highlight overlay are not implemented (they need pdf.js TextLayer/AnnotationLayer + their CSS).
	 * Search finds and scrolls to the matching page; selection/link overlay is deferred. Zoom, page nav,
	 * find, fullscreen, and theme are supported.
	 */
	let { url }: { url: string } = $props();

	const MAX_PAGE_WIDTH = 820;
	const ZOOM_MIN = 0.5;
	const ZOOM_MAX = 3;
	const ZOOM_STEP = 0.2;

	let rootEl = $state<HTMLDivElement | null>(null);
	let columnEl = $state<HTMLDivElement | null>(null);
	let pdf = $state<PDFDocumentProxy | null>(null);
	let numPages = $state(0);
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let fitWidth = $state(0);
	let zoom = $state(1);
	let currentPage = $state(1);
	let isFullscreen = $state(false);

	let searchOpen = $state(false);
	let searchInput = $state('');
	let matches = $state<number[]>([]);
	let activeMatch = $state(0);

	// Extracted page text cache (non-reactive).
	let pageTexts: string[] | null = null;

	const pageWidth = $derived(fitWidth > 0 ? Math.max(240, Math.round(fitWidth * zoom)) : 0);
	const hasPages = $derived(numPages > 0 && pageWidth > 0);
	const zoomPercent = $derived(Math.round(zoom * 100));

	function scrollToPage(pageNumber: number) {
		document
			.getElementById(`pdf-page-${pageNumber}`)
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	// Load the document (browser-only).
	$effect(() => {
		if (!browser) return;
		const src = url;
		let cancelled = false;
		let doc: PDFDocumentProxy | null = null;
		status = 'loading';
		(async () => {
			try {
				const pdfjs = await import('pdfjs-dist');
				pdfjs.GlobalWorkerOptions.workerSrc = new URL(
					'pdfjs-dist/build/pdf.worker.min.mjs',
					import.meta.url
				).toString();
				doc = await pdfjs.getDocument({ url: src, verbosity: 0 }).promise;
				if (cancelled) {
					void doc.destroy();
					return;
				}
				pdf = doc;
				numPages = doc.numPages;
				pageTexts = null;
				status = 'ready';
			} catch {
				if (!cancelled) status = 'error';
			}
		})();
		return () => {
			cancelled = true;
			void doc?.destroy();
		};
	});

	// Measure the column width + own the current-page tracking (imperative external sources).
	$effect(() => {
		if (!browser) return;
		const el = columnEl;
		if (!el) return;
		const measure = () => {
			const width = el.clientWidth;
			if (width > 0) fitWidth = Math.min(width, MAX_PAGE_WIDTH);
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	});

	// Track the page under the vertical centre of the viewport.
	$effect(() => {
		if (!browser || !hasPages) return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						const pageNumber = Number(entry.target.getAttribute('data-page'));
						if (pageNumber) currentPage = pageNumber;
					}
				}
			},
			{ rootMargin: '-45% 0px -45% 0px', threshold: 0 }
		);
		for (let pageNumber = 1; pageNumber <= numPages; pageNumber += 1) {
			const element = document.getElementById(`pdf-page-${pageNumber}`);
			if (element) observer.observe(element);
		}
		return () => observer.disconnect();
	});

	// Fullscreen state sync.
	$effect(() => {
		if (!browser) return;
		const onChange = () => (isFullscreen = Boolean(document.fullscreenElement));
		document.addEventListener('fullscreenchange', onChange);
		return () => document.removeEventListener('fullscreenchange', onChange);
	});

	// Debounced full-document search over extracted page text.
	$effect(() => {
		if (!browser || !searchOpen) return;
		const input = searchInput;
		let cancelled = false;
		const timer = window.setTimeout(async () => {
			const trimmed = input.trim();
			if (!trimmed) {
				matches = [];
				activeMatch = 0;
				return;
			}
			const doc = pdf;
			if (!doc) return;
			if (!pageTexts) {
				const pageNumbers = Array.from({ length: doc.numPages }, (_, index) => index + 1);
				pageTexts = await Promise.all(
					pageNumbers.map(async (pageNumber) => {
						const page = await doc.getPage(pageNumber);
						const content = await page.getTextContent();
						return content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
					})
				);
			}
			if (cancelled) return;
			const needle = trimmed.toLowerCase();
			const found: number[] = [];
			pageTexts.forEach((text, index) => {
				const lower = text.toLowerCase();
				let at = lower.indexOf(needle);
				while (at !== -1) {
					found.push(index + 1);
					at = lower.indexOf(needle, at + needle.length);
				}
			});
			matches = found;
			activeMatch = 0;
			if (found.length > 0) scrollToPage(found[0]);
		}, 250);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	});

	function goToMatch(index: number) {
		if (matches.length === 0) return;
		const next = (index + matches.length) % matches.length;
		activeMatch = next;
		scrollToPage(matches[next]);
	}

	function toggleFullscreen() {
		const element = rootEl;
		if (!element) return;
		if (document.fullscreenElement) void document.exitFullscreen();
		else void element.requestFullscreen?.();
	}

	function closeSearch() {
		searchOpen = false;
		searchInput = '';
		matches = [];
		activeMatch = 0;
	}

	function zoomIn() {
		zoom = Math.min(ZOOM_MAX, Math.round((zoom + ZOOM_STEP) * 100) / 100);
	}
	function zoomOut() {
		zoom = Math.max(ZOOM_MIN, Math.round((zoom - ZOOM_STEP) * 100) / 100);
	}
</script>

<div bind:this={rootEl} class="aqsha-pdf-root relative w-full bg-background">
	<div bind:this={columnEl} class="w-full overflow-x-auto">
		{#if status === 'loading'}
			<div
				class="flex min-h-[280px] items-center justify-center gap-2 text-[13px] font-medium text-muted-foreground"
			>
				<Icon icon={Loader2Icon} class="size-4 animate-spin" />
				Loading PDF…
			</div>
		{:else if status === 'error'}
			<div
				class="flex min-h-[280px] items-center justify-center gap-2 text-[13px] font-medium text-muted-foreground"
			>
				<Icon icon={AlertCircleIcon} class="size-4 text-destructive" />
				We couldn't display this PDF.
			</div>
		{:else if hasPages && pdf}
			<div class="w-full space-y-5">
				{#each Array.from({ length: numPages }, (_, i) => i + 1) as pageNumber (pageNumber)}
					<PdfPageCanvas {pdf} {pageNumber} width={pageWidth} eager={pageNumber <= 2} />
				{/each}
			</div>
		{/if}
	</div>

	{#if numPages > 0}
		<div class="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
			{#if searchOpen}
				<div
					class="flex max-w-[calc(100vw-1.5rem)] items-center gap-1 rounded-full border border-border bg-popover/95 px-2 py-1 shadow-md backdrop-blur supports-[backdrop-filter]:bg-popover/80"
				>
					<Icon icon={SearchIcon} class="ml-1 size-3.5 shrink-0 text-muted-foreground" />
					<!-- svelte-ignore a11y_autofocus -->
					<input
						autofocus
						bind:value={searchInput}
						onkeydown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								if (event.shiftKey) goToMatch(activeMatch - 1);
								else goToMatch(activeMatch + 1);
							}
							if (event.key === 'Escape') closeSearch();
						}}
						placeholder="Find in document"
						aria-label="Find in document"
						class="h-7 w-36 min-w-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground sm:w-44"
					/>
					<span class="shrink-0 px-1 text-[12px] tabular-nums text-muted-foreground">
						{searchInput.trim()
							? matches.length > 0
								? `${activeMatch + 1}/${matches.length}`
								: '0/0'
							: ''}
					</span>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						class="shrink-0"
						aria-label="Previous match"
						title="Previous match"
						disabled={matches.length === 0}
						onclick={() => goToMatch(activeMatch - 1)}
					>
						<Icon icon={ChevronUpIcon} class="size-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						class="shrink-0"
						aria-label="Next match"
						title="Next match"
						disabled={matches.length === 0}
						onclick={() => goToMatch(activeMatch + 1)}
					>
						<Icon icon={ChevronDownIcon} class="size-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						class="shrink-0"
						aria-label="Close search"
						title="Close search"
						onclick={closeSearch}
					>
						<Icon icon={XIcon} class="size-4" />
					</Button>
				</div>
			{/if}

			<div
				role="toolbar"
				aria-label="PDF reading tools"
				class="flex max-w-[calc(100vw-1.5rem)] items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-popover/95 px-1.5 py-1 shadow-md backdrop-blur supports-[backdrop-filter]:bg-popover/80"
			>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					class="shrink-0"
					aria-label="Zoom out"
					title="Zoom out"
					disabled={zoom <= ZOOM_MIN}
					onclick={zoomOut}
				>
					<Icon icon={MinusIcon} class="size-4" />
				</Button>
				<button
					type="button"
					onclick={() => (zoom = 1)}
					title="Fit width"
					class="min-w-12 shrink-0 rounded-md px-1.5 py-1 text-[12px] font-medium tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					{zoomPercent}%
				</button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					class="shrink-0"
					aria-label="Zoom in"
					title="Zoom in"
					disabled={zoom >= ZOOM_MAX}
					onclick={zoomIn}
				>
					<Icon icon={PlusIcon} class="size-4" />
				</Button>

				<span class="mx-0.5 h-5 w-px shrink-0 bg-border"></span>

				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					class="shrink-0"
					aria-label="Previous page"
					title="Previous page"
					disabled={currentPage <= 1}
					onclick={() => scrollToPage(Math.max(1, currentPage - 1))}
				>
					<Icon icon={ChevronUpIcon} class="size-4" />
				</Button>
				<span class="shrink-0 px-1 text-[12px] font-medium tabular-nums text-muted-foreground">
					{currentPage} / {numPages}
				</span>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					class="shrink-0"
					aria-label="Next page"
					title="Next page"
					disabled={currentPage >= numPages}
					onclick={() => scrollToPage(Math.min(numPages, currentPage + 1))}
				>
					<Icon icon={ChevronDownIcon} class="size-4" />
				</Button>

				<span class="mx-0.5 h-5 w-px shrink-0 bg-border"></span>

				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					class={cn('shrink-0', searchOpen && 'bg-accent text-foreground')}
					aria-label="Find in document"
					title="Find in document"
					onclick={() => (searchOpen ? closeSearch() : (searchOpen = true))}
				>
					<Icon icon={SearchIcon} class="size-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					class="shrink-0"
					aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
					title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
					onclick={toggleFullscreen}
				>
					{#if isFullscreen}
						<Icon icon={MinimizeIcon} class="size-4" />
					{:else}
						<Icon icon={MaximizeIcon} class="size-4" />
					{/if}
				</Button>
			</div>
		</div>
	{/if}

	{#if numPages > 0 && currentPage > 1}
		<button
			type="button"
			onclick={() => scrollToPage(1)}
			aria-label="Back to top"
			title="Back to top"
			class="fixed bottom-5 right-5 z-40 flex size-10 items-center justify-center rounded-full border border-border bg-popover/95 text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-foreground supports-[backdrop-filter]:bg-popover/80"
		>
			<Icon icon={ArrowUpToLineIcon} class="size-4" />
		</button>
	{/if}
</div>
