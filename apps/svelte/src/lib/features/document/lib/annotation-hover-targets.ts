/**
 * Deteksi blok semantik (judul/paragraf/daftar) di atas preview SVG Typst untuk mode anotasi.
 * SVG tak punya markup semantik — sumber target = semantic text layer renderer
 * (`foreignObject > div.tsel` per text-run, membawa teks asli + font-size), lalu blok
 * direkonstruksi geometris: fragmen → baris → blok. Klasifikasi memakai `outlineTitles`
 * + lonjakan font-size. Anchor tetap `{selectedText, page, rects}` (kompatibel alur agen).
 */
import { pageElements, type AnnotationDraft, type AnnotationRect } from './annotation-selection';

export type SemanticBlockKind = 'judul' | 'paragraf' | 'daftar' | 'baris';

export type SemanticBlock = {
	page: number;
	kind: SemanticBlockKind;
	/** Teks badge hover: judul outline yang cocok, selain itu cuplikan teks blok. */
	label: string;
	/** Anchor kanonik (`selectedText`) — gabungan teks baris blok. */
	text: string;
	/** Kotak per-baris, ternormalisasi 0..1 relatif kotak halaman. */
	rects: AnnotationRect[];
	/** Union rects — untuk hit-test & outline hover. */
	bbox: AnnotationRect;
};

/** Fragmen teks mentah (px viewport) — satu `foreignObject.tsel`. */
export type TextFragment = {
	left: number;
	top: number;
	right: number;
	bottom: number;
	text: string;
	fontSize: number;
};

type Line = TextFragment;

/** Blok hasil grouping, masih dalam px viewport (sebelum normalisasi halaman). */
export type RawBlock = {
	kind: SemanticBlockKind;
	label: string;
	text: string;
	lines: Line[];
};

const MAX_RECTS = 32;
const MAX_TEXT = 2000;
const MIN_FRAGMENT_PX = 0.5;
/** Baris bergabung ke blok bila jaraknya < rasio ini × tinggi baris terkecil. */
const BLOCK_GAP_RATIO = 0.75;
/** Selisih font-size antar baris di atas rasio ini = batas blok. */
const FONT_JUMP_RATIO = 0.15;
/** Font-size > rasio ini × median body = heading (walau tak ter-outline). */
const HEADING_FONT_RATIO = 1.15;
const LABEL_PREVIEW = 52;
const LIST_MARKER = /^(?:[•‣◦▪–-]|\d{1,3}[.)])\s/;

function clamp01(n: number): number {
	return n < 0 ? 0 : n > 1 ? 1 : n;
}

function preview(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalizeText(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

/** Fragmen → baris: merge yang pusat-y-nya saling tumpang-tindih vertikal. */
export function groupFragmentsIntoLines(fragments: TextFragment[]): Line[] {
	const sorted = fragments.toSorted((a, b) => a.top - b.top || a.left - b.left);
	const lines: Line[] = [];
	for (const frag of sorted) {
		const cy = (frag.top + frag.bottom) / 2;
		const line = lines.find((l) => cy >= l.top && cy <= l.bottom);
		if (!line) {
			lines.push({ ...frag });
			continue;
		}
		// Teks ter-join urut kiri→kanan; fragmen datang terurut left hanya dalam top yang sama,
		// jadi sisipkan berdasar posisi horizontal.
		line.text = frag.left < line.left ? `${frag.text} ${line.text}` : `${line.text} ${frag.text}`;
		line.left = Math.min(line.left, frag.left);
		line.top = Math.min(line.top, frag.top);
		line.right = Math.max(line.right, frag.right);
		line.bottom = Math.max(line.bottom, frag.bottom);
		line.fontSize = Math.max(line.fontSize, frag.fontSize);
	}
	return lines.sort((a, b) => a.top - b.top || a.left - b.left);
}

function sameBlock(prev: Line, next: Line): boolean {
	const gap = next.top - prev.bottom;
	if (gap >= BLOCK_GAP_RATIO * Math.min(next.bottom - next.top, prev.bottom - prev.top)) {
		return false;
	}
	if (prev.fontSize > 0 && next.fontSize > 0) {
		if (Math.abs(next.fontSize - prev.fontSize) / prev.fontSize >= FONT_JUMP_RATIO) return false;
	}
	return true;
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = values.toSorted((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)]!;
}

function matchesOutlineTitle(
	text: string,
	lineCount: number,
	outlineTitles: string[]
): string | null {
	if (lineCount > 2) return null;
	const normalized = normalizeText(text).toLowerCase();
	if (!normalized) return null;
	for (const title of outlineTitles) {
		const t = normalizeText(title).toLowerCase();
		if (!t) continue;
		if (normalized === t || normalized.includes(t)) return normalizeText(title);
	}
	return null;
}

/** Baris → blok terklasifikasi. Pure (px viewport) supaya bisa diuji tanpa DOM SVG. */
export function groupLinesIntoBlocks(lines: Line[], outlineTitles: string[]): RawBlock[] {
	const fontSizes: number[] = [];
	for (const line of lines) if (line.fontSize > 0) fontSizes.push(line.fontSize);
	const medianFont = median(fontSizes);
	const groups: Line[][] = [];
	for (const line of lines) {
		const current = groups[groups.length - 1];
		if (current && sameBlock(current[current.length - 1]!, line)) current.push(line);
		else groups.push([line]);
	}
	const blocks: RawBlock[] = [];
	for (const group of groups) {
		const text = normalizeText(group.map((l) => l.text).join(' '));
		if (!text) continue;
		const maxFont = Math.max(...group.map((l) => l.fontSize));
		const outlineTitle = matchesOutlineTitle(text, group.length, outlineTitles);
		let kind: SemanticBlockKind;
		let label: string;
		if (outlineTitle) {
			kind = 'judul';
			label = outlineTitle;
		} else if (medianFont > 0 && maxFont > HEADING_FONT_RATIO * medianFont && group.length <= 2) {
			kind = 'judul';
			label = preview(text, LABEL_PREVIEW);
		} else if (LIST_MARKER.test(normalizeText(group[0]!.text))) {
			kind = 'daftar';
			label = preview(text, LABEL_PREVIEW);
		} else if (group.length === 1 && !text.includes(' ')) {
			kind = 'baris';
			label = preview(text, LABEL_PREVIEW);
		} else {
			kind = 'paragraf';
			label = preview(text, LABEL_PREVIEW);
		}
		blocks.push({ kind, label, text, lines: group });
	}
	return blocks;
}

function collectFragments(pageEl: Element): TextFragment[] {
	const fragments: TextFragment[] = [];
	for (const fo of Array.from(pageEl.querySelectorAll('foreignObject'))) {
		const tsel = fo.querySelector<HTMLElement>('.tsel');
		if (!tsel) continue;
		const text = normalizeText(fo.textContent ?? '');
		if (!text) continue;
		const rect = fo.getBoundingClientRect();
		if (rect.width <= MIN_FRAGMENT_PX || rect.height <= MIN_FRAGMENT_PX) continue;
		fragments.push({
			left: rect.left,
			top: rect.top,
			right: rect.right,
			bottom: rect.bottom,
			text,
			fontSize: Number.parseFloat(tsel.style.fontSize) || 0
		});
	}
	return fragments;
}

function unionRect(rects: AnnotationRect[]): AnnotationRect {
	let x0 = 1;
	let y0 = 1;
	let x1 = 0;
	let y1 = 0;
	for (const r of rects) {
		x0 = Math.min(x0, r.x);
		y0 = Math.min(y0, r.y);
		x1 = Math.max(x1, r.x + r.w);
		y1 = Math.max(y1, r.y + r.h);
	}
	return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/**
 * Bangun indeks blok semantik seluruh halaman. Mahal (querySelectorAll + getBoundingClientRect
 * per fragmen) — panggil sekali per (render, zoom, resize) lalu cache; koordinat hasil sudah
 * ternormalisasi per halaman sehingga tahan scroll.
 */
export function buildBlockIndex(svgHost: HTMLElement, outlineTitles: string[]): SemanticBlock[] {
	const blocks: SemanticBlock[] = [];
	const pages = pageElements(svgHost);
	for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
		const pageEl = pages[pageIndex]!;
		const pageBox = pageEl.getBoundingClientRect();
		if (pageBox.width <= 0 || pageBox.height <= 0) continue;
		const lines = groupFragmentsIntoLines(collectFragments(pageEl));
		for (const raw of groupLinesIntoBlocks(lines, outlineTitles)) {
			const rects = raw.lines
				.map((l) => ({
					x: clamp01((l.left - pageBox.left) / pageBox.width),
					y: clamp01((l.top - pageBox.top) / pageBox.height),
					w: clamp01((l.right - l.left) / pageBox.width),
					h: clamp01((l.bottom - l.top) / pageBox.height)
				}))
				.slice(0, MAX_RECTS);
			if (rects.length === 0) continue;
			blocks.push({
				page: pageIndex + 1,
				kind: raw.kind,
				label: raw.label,
				text: raw.text.slice(0, MAX_TEXT),
				rects,
				bbox: unionRect(rects)
			});
		}
	}
	return blocks;
}

/** Blok termuat titik viewport (client px), pilih bbox terkecil bila bertumpuk. */
export function hitTestBlock(
	index: SemanticBlock[],
	svgHost: HTMLElement,
	clientX: number,
	clientY: number
): SemanticBlock | null {
	const pages = pageElements(svgHost);
	let best: SemanticBlock | null = null;
	let bestArea = Number.POSITIVE_INFINITY;
	for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
		const box = pages[pageIndex]!.getBoundingClientRect();
		if (
			box.width <= 0 ||
			box.height <= 0 ||
			clientX < box.left ||
			clientX > box.right ||
			clientY < box.top ||
			clientY > box.bottom
		) {
			continue;
		}
		const nx = (clientX - box.left) / box.width;
		const ny = (clientY - box.top) / box.height;
		for (const block of index) {
			if (block.page !== pageIndex + 1) continue;
			const b = block.bbox;
			if (nx < b.x || nx > b.x + b.w || ny < b.y || ny > b.y + b.h) continue;
			const area = b.w * b.h;
			if (area < bestArea) {
				best = block;
				bestArea = area;
			}
		}
	}
	return best;
}

export function blockToDraft(block: SemanticBlock): AnnotationDraft {
	return { selectedText: block.text, page: block.page, rects: block.rects };
}
