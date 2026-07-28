<script lang="ts">
	import { browser } from '$app/environment';
	import { publicEnv } from '$lib/env/public';
	import { cn } from '@aqsha/ui-svelte/utils';

	/**
	 * Page-1 PDF thumbnail for an Explore card. Rendered directly via `pdfjs-dist` (no react-pdf) to a
	 * `<canvas>`. arXiv/publisher PDFs hit CORS, so the file is fetched through the API proxy
	 * `/papers/pdf-proxy` (provenance-checked, Range passthrough → pdf.js only pulls the first page's
	 * chunks). Lazy in-view; on failure/timeout → `onFail()` so the card falls back to its GenerativeCover.
	 * Browser-only: `pdfjs-dist` touches `DOMMatrix`/`OffscreenCanvas`, so it's dynamically imported behind
	 * `browser` (SSR never evaluates it). The parent keys this component by `pdfUrl` (remount per URL).
	 *
	 * A cheap dev-only PROBE (1 byte) runs first: a paywalled/broken PDF (502/HTML/404) is caught here so
	 * pdf.js never sees a failing URL → zero console noise. In prod the probe is skipped (saves a
	 * round-trip); pdf.js's own load error still nets the fallback.
	 */
	let { pdfUrl, onFail }: { pdfUrl: string; onFail: () => void } = $props();

	const API_BASE = publicEnv.PUBLIC_API_URL;
	const RENDER_TIMEOUT_MS = 12_000;
	// Probe pre-render only in dev; in prod render directly when in view.
	const SKIP_PROBE = import.meta.env.PROD;

	let containerEl = $state<HTMLDivElement | null>(null);
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let inView = $state(false);
	let width = $state(0);
	let rendered = $state(false);

	// Non-reactive guards: fire `onFail` once; start the render once per resolved URL.
	let failed = false;
	let startedFor: string | null = null;
	function fail(): void {
		if (failed) return;
		failed = true;
		onFail();
	}

	const file = $derived(`${API_BASE}/papers/pdf-proxy?u=${encodeURIComponent(pdfUrl)}`);

	// Measure card width + lazy in-view (imperative external source → valid $effect).
	$effect(() => {
		if (!browser) return;
		const el = containerEl;
		if (!el) return;
		const measure = () => {
			const w = el.clientWidth;
			if (w > 0) width = w;
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					inView = true;
					io.disconnect();
				}
			},
			{ rootMargin: '500px' }
		);
		io.observe(el);
		return () => {
			ro.disconnect();
			io.disconnect();
		};
	});

	// Render page 1 once in-view + measured. Dedup via `startedFor` (non-reactive) so setting `rendered`
	// doesn't re-trigger; timeout guard → fallback. `disableAutoFetch` + stream → pdf.js uses HTTP Range.
	$effect(() => {
		if (!browser || !inView || width <= 0) return;
		const src = file;
		const targetWidth = width;
		const canvas = canvasEl;
		if (!canvas || failed || startedFor === src) return;
		startedFor = src;

		let cancelled = false;
		const timer = setTimeout(fail, RENDER_TIMEOUT_MS);

		(async () => {
			try {
				if (!SKIP_PROBE) {
					const res = await fetch(src, { headers: { Range: 'bytes=0-0' } });
					const type = res.headers.get('content-type') ?? '';
					await res.body?.cancel().catch(() => {});
					if (cancelled) return;
					if (!res.ok || !type.includes('pdf')) {
						clearTimeout(timer);
						fail();
						return;
					}
				}
				const pdfjs = await import('pdfjs-dist');
				pdfjs.GlobalWorkerOptions.workerSrc = new URL(
					'pdfjs-dist/build/pdf.worker.min.mjs',
					import.meta.url
				).toString();
				const doc = await pdfjs.getDocument({
					url: src,
					disableAutoFetch: true,
					disableStream: false,
					verbosity: 0
				}).promise;
				if (cancelled) {
					void doc.destroy();
					return;
				}
				const page = await doc.getPage(1);
				const base = page.getViewport({ scale: 1 });
				const viewport = page.getViewport({ scale: targetWidth / base.width });
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					clearTimeout(timer);
					fail();
					void doc.destroy();
					return;
				}
				canvas.width = Math.floor(viewport.width);
				canvas.height = Math.floor(viewport.height);
				await page.render({ canvasContext: ctx, viewport, canvas }).promise;
				void doc.destroy();
				if (cancelled) return;
				clearTimeout(timer);
				rendered = true;
			} catch {
				clearTimeout(timer);
				if (!cancelled) fail();
			}
		})();

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	});
</script>

<div bind:this={containerEl} aria-hidden="true" class="absolute inset-0 overflow-hidden">
	<canvas
		bind:this={canvasEl}
		class={cn(
			'block h-auto w-full transition-opacity duration-200',
			rendered ? 'opacity-100' : 'opacity-0'
		)}
	></canvas>

	<!-- Skeleton while loading (in-view until page-1 renders). Before in-view & on failure: transparent
	     → the GenerativeCover behind shows through. -->
	<div
		class={cn(
			'pointer-events-none absolute inset-0 bg-muted transition-opacity duration-300',
			inView && !rendered ? 'animate-pulse opacity-100' : 'opacity-0'
		)}
	>
		<div class="absolute inset-x-4 top-4 space-y-2">
			<div class="h-2 w-3/4 rounded-full bg-foreground/10"></div>
			<div class="h-2 w-1/2 rounded-full bg-foreground/10"></div>
		</div>
	</div>
</div>
