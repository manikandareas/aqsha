<script lang="ts">
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import type { PDFDocumentProxy } from 'pdfjs-dist';
	import type { AnnotationRect, AnnotationView } from '../api';
	import { clientRectsToPdfRects, mergeAdjacentRects, pdfRectToCss } from './annotation-geometry';

	/**
	 * Satu halaman PDF beranotasi: canvas + text layer (seleksi) + overlay marker.
	 * Text layer WAJIB untuk seleksi teks; overlay diposisikan dalam PDF point × skala render.
	 * Container text layer butuh `--scale-factor` (kontrak pdf.js v4+).
	 */
	let {
		pdf,
		pageNumber,
		width,
		eager = false,
		annotatable = true,
		pinMode = false,
		annotations,
		activeAnnotationId = null,
		onCreateHighlight,
		onCreatePin,
		onSelectAnnotation
	}: {
		pdf: PDFDocumentProxy;
		pageNumber: number;
		width: number;
		eager?: boolean;
		annotatable?: boolean;
		pinMode?: boolean;
		annotations: AnnotationView[];
		activeAnnotationId?: string | null;
		onCreateHighlight?: (a: {
			page: number;
			rects: AnnotationRect[];
			selectedText: string;
		}) => void;
		onCreatePin?: (a: { page: number; x: number; y: number }) => void;
		onSelectAnnotation?: (id: string) => void;
	} = $props();

	let containerEl = $state<HTMLDivElement | null>(null);
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let textLayerEl = $state<HTMLDivElement | null>(null);
	let visible = $state(untrack(() => eager));
	let renderedFor = $state<string | null>(null);
	let baseWidth = $state(595); // diganti ukuran asli saat halaman dimuat
	const scale = $derived(width > 0 && baseWidth > 0 ? width / baseWidth : 1);
	const estimatedHeight = $derived(Math.round(width * 1.414));
	const pageAnnotations = $derived(annotations.filter((a) => a.page === pageNumber));

	// Lazy in-view — identik pola PdfPageCanvas.
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

	// Render canvas + text layer saat visible/zoom berubah.
	$effect(() => {
		if (!browser || !visible || width <= 0) return;
		const targetWidth = width;
		const canvas = canvasEl;
		const textContainer = textLayerEl;
		const key = `${pageNumber}-${targetWidth}`;
		if (!canvas || !textContainer || renderedFor === key) return;

		let cancelled = false;
		let task: { cancel: () => void } | null = null;
		(async () => {
			try {
				const pdfjs = await import('pdfjs-dist');
				const page = await pdf.getPage(pageNumber);
				if (cancelled) return;
				const base = page.getViewport({ scale: 1 });
				baseWidth = base.width;
				const viewport = page.getViewport({ scale: targetWidth / base.width });
				const ctx = canvas.getContext('2d');
				if (!ctx) return;
				canvas.width = Math.floor(viewport.width);
				canvas.height = Math.floor(viewport.height);
				const renderTask = page.render({ canvasContext: ctx, viewport, canvas });
				task = renderTask;
				await renderTask.promise;
				if (cancelled) return;

				// Text layer: pdf.js menulis span terposisi absolut; --scale-factor wajib
				// supaya offset span cocok dengan canvas (kontrak pdf.js v4+).
				textContainer.replaceChildren();
				textContainer.style.setProperty('--scale-factor', String(viewport.scale));
				const textLayer = new pdfjs.TextLayer({
					textContentSource: page.streamTextContent(),
					container: textContainer,
					viewport
				});
				await textLayer.render();
				if (!cancelled) renderedFor = key;
			} catch {
				// Render dibatalkan (zoom beruntun) → biarkan; render baru menggantikan.
			}
		})();
		return () => {
			cancelled = true;
			task?.cancel();
		};
	});

	function handleMouseUp(): void {
		if (!annotatable || pinMode || !onCreateHighlight) return;
		const selection = window.getSelection();
		const container = containerEl;
		if (!selection || selection.isCollapsed || !container) return;
		const range = selection.getRangeAt(0);
		if (!container.contains(range.commonAncestorContainer)) return;
		const text = selection.toString().trim();
		if (!text) return;
		const pageBox = container.getBoundingClientRect();
		const rects = mergeAdjacentRects(
			clientRectsToPdfRects([...range.getClientRects()], pageBox, scale)
		);
		if (rects.length === 0) return;
		onCreateHighlight({ page: pageNumber, rects, selectedText: text.slice(0, 2000) });
		selection.removeAllRanges();
	}

	function handleClick(event: MouseEvent): void {
		if (!annotatable || !pinMode || !onCreatePin) return;
		const container = containerEl;
		if (!container) return;
		const pageBox = container.getBoundingClientRect();
		onCreatePin({
			page: pageNumber,
			x: (event.clientX - pageBox.left) / scale,
			y: (event.clientY - pageBox.top) / scale
		});
	}
</script>

<div
	bind:this={containerEl}
	id={`pdf-page-${pageNumber}`}
	data-page={pageNumber}
	class="aqsha-pdf-page relative mx-auto select-text"
	style={`width:${width}px`}
	onmouseup={handleMouseUp}
	onclick={handleClick}
	role="presentation"
>
	{#if visible}
		<canvas bind:this={canvasEl} class="block h-auto w-full"></canvas>
		<div bind:this={textLayerEl} class="aqsha-pdf-textlayer absolute inset-0"></div>
		<div class="pointer-events-none absolute inset-0">
			{#each pageAnnotations as annotation (annotation.id)}
				{#each annotation.rects as rect, i (i)}
					{@const css = pdfRectToCss(rect, scale)}
					<button
						type="button"
						class="pointer-events-auto absolute rounded-sm border-2 transition-colors
							{annotation.id === activeAnnotationId
							? 'border-primary bg-primary/20'
							: annotation.kind === 'highlight'
								? 'border-transparent bg-lemon/40 hover:bg-lemon/60'
								: 'border-coral bg-coral/20 hover:bg-coral/40'}
							{annotation.status === 'resolved' || annotation.status === 'dismissed' ? 'opacity-30' : ''}"
						style={`left:${css.left}px;top:${css.top}px;width:${Math.max(css.width, 12)}px;height:${Math.max(css.height, 12)}px`}
						aria-label={`Anotasi: ${annotation.note ?? annotation.selectedText ?? 'pin'}`}
						onclick={(e) => {
							e.stopPropagation();
							onSelectAnnotation?.(annotation.id);
						}}
					></button>
				{/each}
			{/each}
		</div>
	{:else}
		<div style={`height:${estimatedHeight}px`}></div>
	{/if}
</div>

<style>
	/* Gaya minimal text layer pdf.js (tanpa import CSS penuh viewer): teks transparan,
	   span absolut mengikuti transform yang ditulis pdf.js. */
	.aqsha-pdf-textlayer {
		overflow: hidden;
		line-height: 1;
		opacity: 1;
	}
	.aqsha-pdf-textlayer :global(span) {
		color: transparent;
		position: absolute;
		white-space: pre;
		cursor: text;
		transform-origin: 0 0;
	}
	.aqsha-pdf-textlayer :global(::selection) {
		background: color-mix(in oklch, var(--primary) 30%, transparent);
	}
</style>
