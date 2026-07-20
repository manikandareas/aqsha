<script lang="ts">
	import { browser } from '$app/environment';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, Loader2Icon, MinusIcon, PlusIcon, MessageSquareIcon } from '$lib/icons';
	import { normalizeHeadingText } from '../lib/outline';
	import {
		type AnnotationDraft,
		type AnnotationRect,
		type OverlayBox,
		captureSelectionDraft,
		overlayBoxes,
		pageElements
	} from '../lib/annotation-selection';
	import { getTypstRenderer } from '../typst/renderer';

	/**
	 * Preview dokumen Typst: menggambar artifact vektor (hasil compile worker) menjadi SVG teks
	 * terseleksi via renderer typst.ts. Seleksi teks → draft anotasi (`onAnnotate`). Sorotan anotasi
	 * digambar sebagai overlay ternormalisasi. `vector` null (compile gagal total) mempertahankan
	 * render terakhir supaya baca tak terlempar.
	 */
	type PreviewAnnotation = {
		id: string;
		page: number;
		rects: AnnotationRect[];
		status: string;
	};

	let {
		vector,
		annotations = [],
		activeAnnotationId = null,
		onAnnotate,
		onSelectAnnotation
	}: {
		vector: Uint8Array | null;
		annotations?: PreviewAnnotation[];
		activeAnnotationId?: string | null;
		onAnnotate?: (draft: AnnotationDraft) => void;
		onSelectAnnotation?: (id: string) => void;
	} = $props();

	const MAX_WIDTH = 860;

	let scrollEl = $state<HTMLDivElement | null>(null);
	let stageEl = $state<HTMLDivElement | null>(null);
	let svgHost = $state<HTMLDivElement | null>(null);
	let status = $state<'loading' | 'ready'>('loading');
	let fitWidth = $state(0);
	let zoom = $state(1);
	let renderNonce = $state(0);
	let overlayItems = $state<Array<{ id: string; active: boolean; boxes: OverlayBox[] }>>([]);
	let selectionDraft = $state<AnnotationDraft | null>(null);
	let pillPos = $state<{ left: number; top: number } | null>(null);

	const stageWidth = $derived(fitWidth > 0 ? Math.max(280, Math.round(fitWidth * zoom)) : 0);

	// Render tiap vektor baru; pertahankan scroll lintas swap SVG. Vektor null = compile gagal → simpan render lama.
	$effect(() => {
		const v = vector;
		if (!browser || !v || !svgHost) return;
		const host = svgHost;
		let cancelled = false;
		const prevScroll = scrollEl?.scrollTop ?? 0;
		(async () => {
			try {
				const renderer = await getTypstRenderer();
				if (cancelled) return;
				await renderer.renderToSvg({ container: host, format: 'vector', artifactContent: v });
				if (cancelled) return;
				status = 'ready';
				renderNonce += 1;
				requestAnimationFrame(() => {
					if (scrollEl && prevScroll > 0) scrollEl.scrollTop = prevScroll;
				});
			} catch {
				// Pertahankan SVG terakhir; diagnostik ditangani di editor.
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	// Ukur lebar kolom baca (pola viewer existing).
	$effect(() => {
		if (!browser || !scrollEl) return;
		const el = scrollEl;
		const measure = () => {
			const w = el.clientWidth - 32;
			if (w > 0) fitWidth = Math.min(w, MAX_WIDTH);
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	});

	// Seleksi teks → draft anotasi. Listener manual (bukan handler inline) supaya elemen baca tetap
	// semantik dokumen tanpa role interaktif palsu.
	$effect(() => {
		if (!browser || !scrollEl) return;
		const el = scrollEl;
		el.addEventListener('pointerdown', clearSelectionPill);
		el.addEventListener('pointerup', onPointerUp);
		el.addEventListener('scroll', clearSelectionPill, { passive: true });
		return () => {
			el.removeEventListener('pointerdown', clearSelectionPill);
			el.removeEventListener('pointerup', onPointerUp);
			el.removeEventListener('scroll', clearSelectionPill);
		};
	});

	// Hitung ulang overlay sorotan setelah render / zoom / ubah anotasi.
	$effect(() => {
		void renderNonce;
		void zoom;
		void annotations;
		void activeAnnotationId;
		if (!browser) return;
		requestAnimationFrame(refreshOverlays);
	});

	function refreshOverlays(): void {
		if (!svgHost || !stageEl) {
			overlayItems = [];
			return;
		}
		const items: Array<{ id: string; active: boolean; boxes: OverlayBox[] }> = [];
		for (const a of annotations) {
			if (a.status === 'resolved' || a.status === 'dismissed') continue;
			const boxes = overlayBoxes(svgHost, stageEl, a.page, a.rects);
			if (boxes.length > 0) items.push({ id: a.id, active: a.id === activeAnnotationId, boxes });
		}
		overlayItems = items;
	}

	function clearSelectionPill(): void {
		selectionDraft = null;
		pillPos = null;
	}

	function onPointerUp(): void {
		if (!svgHost || !stageEl) return;
		const draft = captureSelectionDraft(svgHost);
		if (!draft) {
			clearSelectionPill();
			return;
		}
		const sel = window.getSelection();
		const rects =
			sel && sel.rangeCount > 0 ? Array.from(sel.getRangeAt(0).getClientRects()) : [];
		const last = rects[rects.length - 1];
		const stageBox = stageEl.getBoundingClientRect();
		pillPos = last
			? { left: last.right - stageBox.left, top: last.bottom - stageBox.top + 8 }
			: null;
		selectionDraft = draft;
	}

	function commitAnnotation(): void {
		if (!selectionDraft) return;
		onAnnotate?.(selectionDraft);
		clearSelectionPill();
		window.getSelection()?.removeAllRanges();
	}

	function setZoom(next: number): void {
		zoom = Math.min(2, Math.max(0.6, Math.round(next * 100) / 100));
	}

	/** Lompat preview ke bab berjudul `title` (cari teks di SVG; nav level-heading). */
	export function scrollToHeading(title: string): void {
		if (!svgHost || !scrollEl) return;
		const needle = normalizeHeadingText(title);
		if (!needle) return;
		for (const page of pageElements(svgHost)) {
			if (!normalizeHeadingText(page.textContent ?? '').includes(needle)) continue;
			const target = headingTarget(page, needle) ?? page;
			scrollTargetIntoView(target);
			return;
		}
	}

	function headingTarget(page: Element, needle: string): Element | null {
		const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
		const nodes: Text[] = [];
		const starts: number[] = [];
		let acc = '';
		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			starts.push(acc.length);
			acc += normalizeHeadingText(n.textContent ?? '');
			nodes.push(n as Text);
		}
		const idx = acc.indexOf(needle);
		if (idx < 0) return null;
		let lo = 0;
		for (let i = 0; i < starts.length; i += 1) {
			if (starts[i]! <= idx) lo = i;
			else break;
		}
		const el = nodes[lo]?.parentElement ?? null;
		return el && page.contains(el) ? el : null;
	}

	function scrollTargetIntoView(target: Element): void {
		if (!scrollEl) return;
		const box = target.getBoundingClientRect();
		const scrollBox = scrollEl.getBoundingClientRect();
		const top = box.top - scrollBox.top + scrollEl.scrollTop - 24;
		scrollEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
	}
</script>

<div class="relative flex min-h-0 flex-1 flex-col bg-paper-rail/40">
	<div bind:this={scrollEl} class="min-h-0 flex-1 overflow-y-auto px-4 py-6">
		{#if status === 'loading'}
			<div
				class="flex min-h-[280px] items-center justify-center gap-2 text-sm text-muted-foreground"
			>
				<Icon icon={Loader2Icon} class="size-4 animate-spin" /> Menyusun preview…
			</div>
		{/if}
		<div
			bind:this={stageEl}
			class="relative mx-auto"
			style:width={stageWidth > 0 ? `${stageWidth}px` : '100%'}
			class:invisible={status === 'loading'}
		>
			<div
				bind:this={svgHost}
				class="typst-preview-svg overflow-hidden rounded-md border border-line bg-white"
			></div>

			<!-- Overlay sorotan anotasi. -->
			{#each overlayItems as item (item.id)}
				{#each item.boxes as box, i (i)}
					<button
						type="button"
						aria-label="Buka anotasi"
						class={`absolute rounded-[3px] transition-colors ${
							item.active ? 'bg-lemon/50 ring-2 ring-lemon' : 'bg-lemon/25 hover:bg-lemon/40'
						}`}
						style:left={`${box.left}px`}
						style:top={`${box.top}px`}
						style:width={`${box.width}px`}
						style:height={`${box.height}px`}
						onclick={() => onSelectAnnotation?.(item.id)}
					></button>
				{/each}
			{/each}

			<!-- Pil "tambah catatan" muncul di ujung seleksi teks. -->
			{#if selectionDraft && pillPos}
				<div
					class="absolute z-20"
					style:left={`${pillPos.left}px`}
					style:top={`${pillPos.top}px`}
				>
					<Button type="button" size="sm" class="gap-1.5 shadow-soft-card" onclick={commitAnnotation}>
						<Icon icon={MessageSquareIcon} class="size-3.5" /> Tambah catatan
					</Button>
				</div>
			{/if}
		</div>
	</div>

	{#if status === 'ready'}
		<div
			role="toolbar"
			aria-label="Alat preview"
			class="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-full border-2 border-border bg-card px-1.5 py-1"
		>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Perkecil"
				disabled={zoom <= 0.6}
				onclick={() => setZoom(zoom - 0.2)}
			>
				<Icon icon={MinusIcon} class="size-4" />
			</Button>
			<button
				type="button"
				class="min-w-12 px-1.5 text-label font-medium tabular-nums text-muted-foreground"
				onclick={() => setZoom(1)}
				title="Pas lebar"
			>
				{Math.round(zoom * 100)}%
			</button>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Perbesar"
				disabled={zoom >= 2}
				onclick={() => setZoom(zoom + 0.2)}
			>
				<Icon icon={PlusIcon} class="size-4" />
			</Button>
		</div>
	{/if}
</div>

<style>
	.typst-preview-svg :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
