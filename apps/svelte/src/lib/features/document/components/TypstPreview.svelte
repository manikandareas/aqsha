<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/environment';
	import type { TypstProject } from '@vedivad/codemirror-typst';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, Loader2Icon, MinusIcon, PlusIcon } from '$lib/icons';
	import { normalizeHeadingText } from '../lib/outline';
	import {
		type AnnotationDraft,
		type AnnotationRect,
		type OverlayBox,
		overlayBoxes,
		pageElements
	} from '../lib/annotation-selection';
	import { AnnotationAgentation } from '../lib/annotation-agentation.svelte';
	import {
		combineSemanticBlockRange,
		resolveSemanticAreaRange,
		resolveVedivadBlockAtPoint
	} from '../lib/annotation-hover-targets';
	import { placePins, type PinCandidate } from '../lib/annotation-pins';
	import { findAnnotationAnchor } from '../lib/annotation-reanchor';
	import type { AnnotationView } from '../api';
	import AnnotationModeLayer from './AnnotationModeLayer.svelte';
	import AnnotationPinLayer from './AnnotationPinLayer.svelte';

	/**
	 * Preview dokumen Typst: memasang SVG terseleksi yang sudah selesai di-compile dan dirender worker.
	 * Mode anotasi dikontrol dari luar (`annotationMode`) — hover blok semantik → popover komentar
	 * inline (`onCreateAnnotation`). Sorotan anotasi digambar sebagai overlay ternormalisasi.
	 * `svg` null (compile gagal total) mempertahankan render terakhir supaya baca tak terlempar.
	 */
	let {
		svg,
		annotations = [],
		activeAnnotationId = null,
		selectedAnnotationIds,
		outlineTitles = [],
		onCreateAnnotation,
		onSelectAnnotation,
		onActiveHeading,
		proposalHunkCount = 0,
		onReviewProposal,
		annotationMode = $bindable(false),
		pinNumbers = $bindable(new Map<string, number>()),
		project = null,
		source = '',
		mainFilePath = '/main.typ',
		onToggleAnnotationContext,
		onAskAnnotation,
		onDismissAnnotation
	}: {
		svg: string | null;
		annotations?: AnnotationView[];
		activeAnnotationId?: string | null;
		selectedAnnotationIds?: ReadonlySet<string>;
		outlineTitles?: string[];
		onCreateAnnotation?: (draft: AnnotationDraft, note: string, elementLabel: string) => void;
		onSelectAnnotation?: (id: string) => void;
		onActiveHeading?: (index: number) => void;
		proposalHunkCount?: number;
		onReviewProposal?: () => void;
		/** Mode anotasi — dikontrol dari header panel induk. */
		annotationMode?: boolean;
		/** Nomor pin per anotasi, dipublikasikan ke induk agar chip composer memakai nomor yang sama. */
		pinNumbers?: Map<string, number>;
		project?: TypstProject | null;
		source?: string;
		mainFilePath?: string;
		onToggleAnnotationContext?: (id: string) => void;
		onAskAnnotation?: (id: string) => void;
		onDismissAnnotation?: (id: string) => void;
	} = $props();

	const MAX_WIDTH = 860;

	let scrollEl = $state<HTMLDivElement | null>(null);
	let stageEl = $state<HTMLDivElement | null>(null);
	let svgHost = $state<HTMLDivElement | null>(null);
	let status = $state<'loading' | 'ready'>('loading');
	let fitWidth = $state(0);
	let zoom = $state(1);
	let renderNonce = $state(0);
	let overlayItems = $state<
		Array<{ id: string; active: boolean; selected: boolean; boxes: OverlayBox[] }>
	>([]);
	let pinCandidates = $state<PinCandidate[]>([]);
	let vedivadBlockCache = new WeakMap<Element, ReturnType<typeof resolveVedivadBlockAtPoint>>();

	const pins = $derived(placePins(pinCandidates));
	const annotationsById = $derived(new Map((annotations ?? []).map((a) => [a.id, a] as const)));

	$effect(() => {
		pinNumbers = new Map(pins.map((pin) => [pin.id, pin.number] as const));
	});

	const stageWidth = $derived(fitWidth > 0 ? Math.max(280, Math.round(fitWidth * zoom)) : 0);

	const agentation = new AnnotationAgentation({
		svgHost: () => svgHost,
		stageEl: () => stageEl,
		outlineTitles: () => outlineTitles,
		resolveBlock: (host, target, clientX, clientY) =>
			resolveVedivadBlockAtPoint({
				project,
				source,
				mainFilePath,
				svgHost: host,
				outlineTitles,
				target,
				clientX,
				clientY,
				cache: vedivadBlockCache
			}),
		resolveRange: (host, start, end, legacyBlocks) =>
			combineSemanticBlockRange({ start, end, legacyBlocks, svgHost: host, source }),
		resolveAreaRange: (host, start, end, legacyBlocks) =>
			resolveSemanticAreaRange({
				project,
				source,
				mainFilePath,
				svgHost: host,
				outlineTitles,
				legacyBlocks,
				start,
				end,
				cache: vedivadBlockCache
			}),
		onCreate: (draft, note, elementLabel) => onCreateAnnotation?.(draft, note, elementLabel)
	});

	$effect(() => {
		agentation.setEnabled(annotationMode);
	});

	// SVG null = compile gagal; pertahankan render terakhir agar pembaca tidak terlempar.
	$effect(() => {
		const nextSvg = svg;
		const host = svgHost;
		if (!browser || !nextSvg || !host) return;
		const prevScroll = scrollEl?.scrollTop ?? 0;
		host.innerHTML = nextSvg;
		status = 'ready';
		renderNonce = untrack(() => renderNonce) + 1;
		requestAnimationFrame(() => {
			if (scrollEl && prevScroll > 0) scrollEl.scrollTop = prevScroll;
		});
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

	// Listener manual (bukan handler inline) supaya elemen baca tetap semantik dokumen tanpa
	// role interaktif palsu. pointermove/click menghidupkan mode anotasi; controller sendiri
	// yang menolak event saat mode off.
	$effect(() => {
		if (!browser || !scrollEl) return;
		const el = scrollEl;
		const onDown = (e: PointerEvent) => agentation.onPointerDown(e);
		const onMove = (e: PointerEvent) => agentation.onPointerMove(e);
		const onUp = (e: PointerEvent) => agentation.onPointerUp(e);
		const onCancel = (e: PointerEvent) => agentation.onPointerCancel(e);
		const onLeave = () => agentation.onPointerLeave();
		const onClick = (e: MouseEvent) => agentation.onStageClick(e);
		el.addEventListener('pointerdown', onDown);
		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerup', onUp);
		el.addEventListener('pointercancel', onCancel);
		el.addEventListener('pointerleave', onLeave);
		el.addEventListener('click', onClick, true);
		el.addEventListener('scroll', onScrollActiveHeading, { passive: true });
		return () => {
			el.removeEventListener('pointerdown', onDown);
			el.removeEventListener('pointermove', onMove);
			el.removeEventListener('pointerup', onUp);
			el.removeEventListener('pointercancel', onCancel);
			el.removeEventListener('pointerleave', onLeave);
			el.removeEventListener('click', onClick, true);
			el.removeEventListener('scroll', onScrollActiveHeading);
			agentation.dispose();
		};
	});

	// Bab aktif untuk ruler TOC: ukur offset tiap heading sekali per render/zoom, lalu saat scroll
	// cukup binary-scan array offset (tanpa tree-walk per scroll).
	let headingOffsets: number[] = [];
	let lastActiveHeading = -1;
	let activeRaf = 0;

	$effect(() => {
		void renderNonce;
		void zoom;
		void outlineTitles;
		if (!browser) return;
		requestAnimationFrame(() => {
			measureHeadingOffsets();
			reportActiveHeading();
		});
	});

	function measureHeadingOffsets(): void {
		headingOffsets = [];
		if (!svgHost || !scrollEl || outlineTitles.length === 0) return;
		const scrollBox = scrollEl.getBoundingClientRect();
		const base = scrollEl.scrollTop;
		for (const title of outlineTitles) {
			const target = findHeadingElement(title);
			if (!target) {
				// Heading belum ter-render (mis. compile menyusul) — pakai offset bab sebelumnya
				// supaya indeks tetap sinkron dengan outline.
				headingOffsets.push(headingOffsets[headingOffsets.length - 1] ?? 0);
				continue;
			}
			const box = target.getBoundingClientRect();
			headingOffsets.push(box.top - scrollBox.top + base);
		}
	}

	function onScrollActiveHeading(): void {
		if (activeRaf) return;
		activeRaf = requestAnimationFrame(() => {
			activeRaf = 0;
			reportActiveHeading();
		});
	}

	function reportActiveHeading(): void {
		if (!scrollEl || headingOffsets.length === 0) return;
		const el = scrollEl;
		// Garis baca di sepertiga atas viewport; mentok bawah = bab terakhir.
		const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
		const line = el.scrollTop + el.clientHeight * 0.3;
		let active = 0;
		if (atBottom) {
			active = headingOffsets.length - 1;
		} else {
			for (let i = 0; i < headingOffsets.length; i += 1) {
				if (headingOffsets[i]! <= line) active = i;
				else break;
			}
		}
		if (active !== lastActiveHeading) {
			lastActiveHeading = active;
			onActiveHeading?.(active);
		}
	}

	// Geometri fragmen berubah saat render/zoom/resize → indeks blok hover di-invalidasi.
	$effect(() => {
		void renderNonce;
		void stageWidth;
		void source;
		void mainFilePath;
		void outlineTitles;
		if (!browser) return;
		vedivadBlockCache = new WeakMap();
		agentation.invalidateIndex();
	});

	// Hitung ulang overlay sorotan setelah render / zoom / ubah anotasi.
	$effect(() => {
		void renderNonce;
		void zoom;
		void annotations;
		void activeAnnotationId;
		void selectedAnnotationIds;
		if (!browser) return;
		requestAnimationFrame(refreshOverlays);
	});

	function refreshOverlays(): void {
		if (!svgHost || !stageEl) {
			overlayItems = [];
			pinCandidates = [];
			return;
		}
		const items: typeof overlayItems = [];
		const candidates: PinCandidate[] = [];
		for (const a of annotations) {
			if (a.status === 'resolved' || a.status === 'dismissed') continue;
			const anchored = a.selectedText ? findAnnotationAnchor(svgHost, a.selectedText) : null;
			// Koordinat tersimpan bersifat absolut; sesudah dokumen berubah hanya pencarian teks yang
			// masih dapat dipercaya untuk menempatkan pin.
			const boxes = anchored
				? [anchorBox(anchored, stageEl)]
				: overlayBoxes(svgHost, stageEl, a.page, a.rects);
			const floating = Boolean(a.selectedText) && anchored === null;
			// Sorotan kotak dilewati untuk anotasi melayang: kotaknya menandai teks yang sudah bukan
			// teks anotasi itu lagi.
			if (!floating && boxes.length > 0) {
				items.push({
					id: a.id,
					active: a.id === activeAnnotationId,
					selected: selectedAnnotationIds?.has(a.id) ?? false,
					boxes
				});
			}
			if (boxes.length > 0) {
				const first = boxes[0]!;
				candidates.push({
					id: a.id,
					page: a.page,
					// Pin duduk di kiri-luar blok supaya tak menutupi teks dokumen.
					left: Math.max(first.left - 14, 10),
					top: first.top + 8,
					status: a.status === 'sent' ? 'sent' : 'open',
					floating
				});
			}
		}
		overlayItems = items;
		pinCandidates = candidates;
	}

	/** Kotak elemen ter-tambat dalam koordinat stage. */
	function anchorBox(el: Element, stage: HTMLElement): OverlayBox {
		const box = el.getBoundingClientRect();
		const stageBox = stage.getBoundingClientRect();
		return {
			left: box.left - stageBox.left,
			top: box.top - stageBox.top,
			width: box.width,
			height: box.height
		};
	}

	function setZoom(next: number): void {
		zoom = Math.min(2, Math.max(0.6, Math.round(next * 100) / 100));
	}

	/** Lompat preview ke bab berjudul `title` (cari teks di SVG; nav level-heading). */
	export function scrollToHeading(title: string): void {
		if (!scrollEl) return;
		const target = findHeadingElement(title);
		if (target) scrollTargetIntoView(target);
	}

	function findHeadingElement(title: string): Element | null {
		if (!svgHost) return null;
		const needle = normalizeHeadingText(title);
		if (!needle) return null;
		for (const page of pageElements(svgHost)) {
			if (!normalizeHeadingText(page.textContent ?? '').includes(needle)) continue;
			return headingTarget(page, needle) ?? page;
		}
		return null;
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
	{#if proposalHunkCount > 0}
		<div
			class="m-3 flex items-center justify-between gap-3 rounded-lg border-2 border-border bg-card px-3 py-2"
		>
			<span class="text-label">Astra mengusulkan {proposalHunkCount} bagian.</span>
			<Button type="button" size="sm" onclick={() => onReviewProposal?.()}>Tinjau usulan</Button>
		</div>
	{/if}
	<div
		bind:this={scrollEl}
		class={[
			'min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-6',
			{ 'cursor-crosshair': agentation.enabled }
		]}
	>
		{#if status === 'loading'}
			<div
				class="flex min-h-[280px] items-center justify-center gap-2 text-sm text-muted-foreground"
			>
				<Icon icon={Loader2Icon} class="size-4 animate-spin" /> Menyusun preview…
			</div>
		{/if}
		<div
			bind:this={stageEl}
			class={['relative mx-auto', { invisible: status === 'loading' }]}
			style:width={stageWidth > 0 ? `${stageWidth}px` : '100%'}
		>
			<div
				bind:this={svgHost}
				class={[
					'typst-preview-svg overflow-hidden rounded-md border border-line bg-white',
					{ 'select-none': agentation.enabled }
				]}
			></div>

			<!-- Overlay sorotan anotasi. -->
			{#each overlayItems as item (item.id)}
				<button
					type="button"
					aria-label="Buka anotasi"
					class="group pointer-events-none absolute inset-0 z-10 outline-none"
					onclick={() => onSelectAnnotation?.(item.id)}
				>
					{#each item.boxes as box, i (i)}
						<span
							aria-hidden="true"
							class={[
								'pointer-events-auto absolute rounded-[3px] transition-colors group-focus-visible:ring-2 group-focus-visible:ring-mint',
								item.active ? 'bg-lemon/50 ring-2 ring-lemon' : 'bg-lemon/25 hover:bg-lemon/40',
								item.selected && 'ring-2 ring-mint'
							]}
							style:left={`${box.left}px`}
							style:top={`${box.top}px`}
							style:width={`${box.width}px`}
							style:height={`${box.height}px`}
						></span>
					{/each}
				</button>
			{/each}

			<AnnotationPinLayer
				{pins}
				{annotationsById}
				{stageEl}
				{scrollEl}
				activeId={activeAnnotationId ?? null}
				contextIds={selectedAnnotationIds ?? new Set()}
				onFocus={(id) => onSelectAnnotation?.(id)}
				onToggleContext={(id) => onToggleAnnotationContext?.(id)}
				onAsk={(id) => onAskAnnotation?.(id)}
				onDismiss={(id) => onDismissAnnotation?.(id)}
			/>

			<AnnotationModeLayer {agentation} {svgHost} {stageEl} {scrollEl} />
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
