<script lang="ts">
	import { browser } from '$app/environment';
	import type { PDFDocumentProxy } from 'pdfjs-dist';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, Loader2Icon, AlertCircleIcon, MinusIcon, PlusIcon, PinIcon } from '$lib/icons';
	import type { AnnotationRect, AnnotationView } from '../api';
	import PdfAnnotatedPage from './PdfAnnotatedPage.svelte';

	/**
	 * Viewer PDF bab: canvas + text layer + overlay anotasi. `url` berganti tiap build baru —
	 * scroll container dipertahankan lintas swap supaya recompile tidak melempar posisi baca.
	 */
	let {
		url,
		annotations = [],
		annotatable = true,
		pinMode = $bindable(false),
		activeAnnotationId = null,
		stale = false,
		onCreateHighlight,
		onCreatePin,
		onSelectAnnotation
	}: {
		url: string;
		annotations?: AnnotationView[];
		annotatable?: boolean;
		pinMode?: boolean;
		activeAnnotationId?: string | null;
		stale?: boolean;
		onCreateHighlight?: (a: {
			page: number;
			rects: AnnotationRect[];
			selectedText: string;
		}) => void;
		onCreatePin?: (a: { page: number; x: number; y: number }) => void;
		onSelectAnnotation?: (id: string) => void;
	} = $props();

	const MAX_PAGE_WIDTH = 820;
	let scrollEl = $state<HTMLDivElement | null>(null);
	let pdf = $state<PDFDocumentProxy | null>(null);
	let numPages = $state(0);
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let fitWidth = $state(0);
	let zoom = $state(1);
	let savedScrollTop = 0;

	const pageWidth = $derived(fitWidth > 0 ? Math.max(240, Math.round(fitWidth * zoom)) : 0);

	// Muat dokumen; simpan scroll sebelum swap URL, pulihkan setelah siap.
	$effect(() => {
		if (!browser) return;
		const src = url;
		let cancelled = false;
		let doc: PDFDocumentProxy | null = null;
		savedScrollTop = scrollEl?.scrollTop ?? 0;
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
				status = 'ready';
				requestAnimationFrame(() => {
					if (scrollEl && savedScrollTop > 0) scrollEl.scrollTop = savedScrollTop;
				});
			} catch {
				if (!cancelled) status = 'error';
			}
		})();
		return () => {
			cancelled = true;
			void doc?.destroy();
		};
	});

	// Ukur lebar kolom (pola viewer existing).
	$effect(() => {
		if (!browser) return;
		const el = scrollEl;
		if (!el) return;
		const measure = () => {
			const w = el.clientWidth - 32;
			if (w > 0) fitWidth = Math.min(w, MAX_PAGE_WIDTH);
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	});
</script>

<div class="relative flex min-h-0 flex-1 flex-col">
	{#if stale}
		<div
			class="absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full border-2 border-border bg-card px-3 py-1 text-label text-muted-foreground"
			role="status"
		>
			PDF belum mencerminkan perubahan terakhir
		</div>
	{/if}
	<div bind:this={scrollEl} class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
		{#if status === 'loading'}
			<div
				class="flex min-h-[280px] items-center justify-center gap-2 text-sm text-muted-foreground"
			>
				<Icon icon={Loader2Icon} class="size-4 animate-spin" /> Memuat PDF…
			</div>
		{:else if status === 'error'}
			<div
				class="flex min-h-[280px] items-center justify-center gap-2 text-sm text-muted-foreground"
			>
				<Icon icon={AlertCircleIcon} class="size-4 text-destructive" /> PDF tidak bisa ditampilkan.
			</div>
		{:else if pdf && pageWidth > 0}
			<div class="w-full space-y-5">
				{#each Array.from({ length: numPages }, (_, i) => i + 1) as pageNumber (pageNumber)}
					<PdfAnnotatedPage
						pdf={pdf!}
						{pageNumber}
						width={pageWidth}
						eager={pageNumber <= 2}
						{annotatable}
						{pinMode}
						{annotations}
						{activeAnnotationId}
						{onCreateHighlight}
						{onCreatePin}
						{onSelectAnnotation}
					/>
				{/each}
			</div>
		{/if}
	</div>
	{#if status === 'ready'}
		<div
			role="toolbar"
			aria-label="Alat baca PDF"
			class="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-full border-2 border-border bg-card px-1.5 py-1"
		>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Perkecil"
				disabled={zoom <= 0.5}
				onclick={() => (zoom = Math.max(0.5, Math.round((zoom - 0.2) * 100) / 100))}
			>
				<Icon icon={MinusIcon} class="size-4" />
			</Button>
			<button
				type="button"
				class="min-w-12 px-1.5 text-label font-medium tabular-nums text-muted-foreground"
				onclick={() => (zoom = 1)}
				title="Pas lebar"
			>
				{Math.round(zoom * 100)}%
			</button>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Perbesar"
				disabled={zoom >= 3}
				onclick={() => (zoom = Math.min(3, Math.round((zoom + 0.2) * 100) / 100))}
			>
				<Icon icon={PlusIcon} class="size-4" />
			</Button>
			{#if annotatable}
				<span class="mx-0.5 h-5 w-px shrink-0 bg-border"></span>
				<Button
					type="button"
					variant={pinMode ? 'secondary' : 'ghost'}
					size="icon-sm"
					aria-label={pinMode ? 'Matikan mode pin' : 'Mode pin — klik PDF untuk menandai titik'}
					aria-pressed={pinMode}
					onclick={() => (pinMode = !pinMode)}
				>
					<Icon icon={PinIcon} class="size-4" />
				</Button>
			{/if}
		</div>
	{/if}
</div>
