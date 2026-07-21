<script lang="ts">
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Textarea } from '@aqsha/ui-svelte/components/textarea';
	import { Icon, PlusIcon } from '$lib/icons';
	import { overlayBoxes, type OverlayBox } from '../lib/annotation-selection';
	import type { AnnotationAgentation } from '../lib/annotation-agentation.svelte';

	/**
	 * Lapisan mode anotasi di dalam `stageEl`: outline blok ter-hover, badge label dekat kursor,
	 * marker titik klik, dan popover komentar inline. Semua absolute stage-relative sehingga
	 * menempel ke dokumen saat scroll/zoom tanpa listener reposition; semua node ber-atribut
	 * `data-annotation-ui` agar hit-test controller mengabaikannya.
	 */
	let {
		agentation,
		svgHost,
		stageEl,
		scrollEl
	}: {
		agentation: AnnotationAgentation;
		svgHost: HTMLElement | null;
		stageEl: HTMLElement | null;
		scrollEl: HTMLElement | null;
	} = $props();

	const PANEL_GAP = 20;
	const PANEL_FALLBACK_H = 150;

	let panelH = $state(0);
	let badgeW = $state(0);
	let textareaWrap = $state<HTMLDivElement | null>(null);

	const activeBlock = $derived(agentation.composer?.block ?? agentation.hover?.block ?? null);

	const outlineBox = $derived.by<OverlayBox | null>(() => {
		if (!activeBlock || !svgHost || !stageEl) return null;
		return overlayBoxes(svgHost, stageEl, activeBlock.page, [activeBlock.bbox])[0] ?? null;
	});

	const stageWidth = $derived(stageEl?.clientWidth ?? 0);

	const badgePos = $derived.by(() => {
		const hover = agentation.hover;
		if (!hover || agentation.composer) return null;
		const left = Math.min(Math.max(hover.cursor.x + 10, 4), Math.max(4, stageWidth - badgeW - 4));
		return { left, top: hover.cursor.y - 34 };
	});

	const panelPos = $derived.by(() => {
		const composer = agentation.composer;
		if (!composer || !stageEl || !scrollEl) return null;
		const width = Math.min(280, Math.max(200, stageWidth - 16));
		const height = panelH || PANEL_FALLBACK_H;
		// Area terlihat scroll container dalam koordinat stage.
		const visibleTop = scrollEl.scrollTop - stageEl.offsetTop;
		const visibleBottom = visibleTop + scrollEl.clientHeight;
		const left = Math.min(
			Math.max(composer.anchor.x - width / 2, 8),
			Math.max(8, stageWidth - width - 8)
		);
		let top = composer.anchor.y + PANEL_GAP;
		if (top + height > visibleBottom - 12) top = composer.anchor.y - height - PANEL_GAP;
		top = Math.max(top, visibleTop + 8);
		return { left, top, width };
	});

	// Autofocus textarea saat popover terbuka (elemen baru dirender setelah state berubah).
	$effect(() => {
		if (!agentation.composer) return;
		textareaWrap?.querySelector('textarea')?.focus();
	});

	function onNoteKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			e.preventDefault();
			agentation.closeComposer();
			return;
		}
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			agentation.submit();
		}
	}
</script>

{#if outlineBox}
	<div
		data-annotation-ui
		class="annotation-outline pointer-events-none absolute z-20 rounded border-2 border-mint bg-mint/10"
		style:left={`${outlineBox.left - 3}px`}
		style:top={`${outlineBox.top - 3}px`}
		style:width={`${outlineBox.width + 6}px`}
		style:height={`${outlineBox.height + 6}px`}
	></div>
{/if}

{#if badgePos && activeBlock}
	<div
		data-annotation-ui
		bind:clientWidth={badgeW}
		class="pointer-events-none absolute z-40 rounded-md bg-foreground px-2 py-1 text-label font-medium whitespace-nowrap text-background"
		style:left={`${badgePos.left}px`}
		style:top={`${badgePos.top}px`}
	>
		<span class="italic">{activeBlock.kind}:</span> "{activeBlock.label}"
	</div>
{/if}

{#if agentation.composer}
	<div
		data-annotation-ui
		class="pointer-events-none absolute z-40 grid size-[22px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-card bg-mint text-mint-foreground"
		style:left={`${agentation.composer.anchor.x}px`}
		style:top={`${agentation.composer.anchor.y}px`}
	>
		<Icon icon={PlusIcon} class="size-3" />
	</div>
{/if}

{#if panelPos && agentation.composer}
	<div
		data-annotation-ui
		role="dialog"
		aria-label="Tambah anotasi"
		bind:clientHeight={panelH}
		class="absolute z-40 flex flex-col gap-2 rounded-lg border-2 border-border bg-card p-2 shadow-[0_2px_0_0_var(--border)]"
		style:left={`${panelPos.left}px`}
		style:top={`${panelPos.top}px`}
		style:width={`${panelPos.width}px`}
	>
		<p class="truncate text-label text-muted-foreground">
			<span class="italic">{agentation.composer.block.kind}</span>
			· "{agentation.composer.block.label}"
		</p>
		<div bind:this={textareaWrap}>
			<Textarea
				bind:value={agentation.note}
				placeholder="Tulis catatan untuk Astra…"
				class="min-h-16 resize-none text-sm"
				onkeydown={onNoteKeydown}
			/>
		</div>
		<div class="flex items-center justify-end gap-1.5">
			<Button type="button" variant="ghost" size="sm" onclick={() => agentation.closeComposer()}>
				Batal
			</Button>
			<Button
				type="button"
				size="sm"
				disabled={agentation.note.trim() === ''}
				onclick={() => agentation.submit()}
			>
				Tambah
			</Button>
		</div>
	</div>
{/if}

<style>
	.annotation-outline {
		transition:
			left 0.18s cubic-bezier(0.22, 1, 0.36, 1),
			top 0.18s cubic-bezier(0.22, 1, 0.36, 1),
			width 0.18s cubic-bezier(0.22, 1, 0.36, 1),
			height 0.18s cubic-bezier(0.22, 1, 0.36, 1);
	}
</style>
