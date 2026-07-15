<script lang="ts">
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import type { PDFDocumentProxy } from 'pdfjs-dist';

	/**
	 * One lazily-rendered PDF page (canvas) — part of {@link PdfArtifactViewer}. The first
	 * `EAGER_PAGE_COUNT` pages render immediately; the rest render when scrolled near (IntersectionObserver
	 * rootMargin 800px). Re-renders when `width` (zoom) changes. Browser-only: pdf.js render touches canvas.
	 */
	let {
		pdf,
		pageNumber,
		width,
		eager = false
	}: {
		pdf: PDFDocumentProxy;
		pageNumber: number;
		width: number;
		eager?: boolean;
	} = $props();

	let containerEl = $state<HTMLDivElement | null>(null);
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let visible = $state(untrack(() => eager));
	let renderedFor = $state<string | null>(null);
	// A4 portrait aspect keeps the scroll height stable before a page paints.
	const estimatedHeight = $derived(Math.round(width * 1.414));

	// Lazy in-view (imperative external source → valid $effect, §3.4).
	$effect(() => {
		if (!browser || visible) return;
		const el = containerEl;
		if (!el) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					visible = true;
					io.disconnect();
				}
			},
			{ rootMargin: '800px 0px' }
		);
		io.observe(el);
		return () => io.disconnect();
	});

	// Render (or re-render on zoom) once visible + measured.
	$effect(() => {
		if (!browser || !visible || width <= 0) return;
		const targetWidth = width;
		const canvas = canvasEl;
		const key = `${pageNumber}-${targetWidth}`;
		if (!canvas || renderedFor === key) return;

		let cancelled = false;
		let task: { cancel: () => void } | null = null;
		(async () => {
			try {
				const page = await pdf.getPage(pageNumber);
				if (cancelled) return;
				const base = page.getViewport({ scale: 1 });
				const viewport = page.getViewport({ scale: targetWidth / base.width });
				const ctx = canvas.getContext('2d');
				if (!ctx) return;
				canvas.width = Math.floor(viewport.width);
				canvas.height = Math.floor(viewport.height);
				const renderTask = page.render({ canvasContext: ctx, viewport, canvas });
				task = renderTask;
				await renderTask.promise;
				if (!cancelled) renderedFor = key;
			} catch {
				// Cancelled renders (zoom churn) throw — ignore; a fresh render replaces this canvas.
			}
		})();

		return () => {
			cancelled = true;
			task?.cancel();
		};
	});
</script>

<div
	bind:this={containerEl}
	id={`pdf-page-${pageNumber}`}
	data-page={pageNumber}
	class="aqsha-pdf-page mx-auto"
	style={`width:${width}px`}
>
	{#if visible}
		<canvas bind:this={canvasEl} class="block h-auto w-full"></canvas>
	{:else}
		<div style={`height:${estimatedHeight}px`}></div>
	{/if}
</div>
