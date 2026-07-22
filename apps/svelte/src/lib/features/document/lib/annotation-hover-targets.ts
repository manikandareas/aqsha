/**
 * Deteksi blok semantik (judul/paragraf/daftar) di atas preview SVG Typst untuk mode anotasi.
 * Renderer lama membawa semantic text layer (`foreignObject > div.tsel`) yang dapat dikelompokkan
 * langsung. Vedivad merender glyph-only SVG, sehingga source identity diselesaikan oleh engine dan
 * `.typst-text` hanya menjadi geometri visual. Anchor keduanya tetap `{selectedText, page, rects}`.
 */
import type { TypstProject } from '@vedivad/codemirror-typst';
import { pageElements, type AnnotationDraft, type AnnotationRect } from './annotation-selection';

export type SemanticBlockKind = 'judul' | 'paragraf' | 'daftar' | 'baris' | 'pilihan';

export type SemanticBlockSelection =
	| { renderer: 'semantic-layer'; start: number; end: number }
	| {
			renderer: 'vedivad';
			start: number;
			end: number;
			sourceStartLine: number;
			sourceEndLine: number;
	  };

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
	/** Urutan visual/source yang diperlukan untuk memperluas drag menjadi range kontigu. */
	selection: SemanticBlockSelection;
};

export type SemanticRangeResult =
	{ ok: true; block: SemanticBlock } | { ok: false; reason: 'different-page' | 'incompatible' };

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

const MIN_FRAGMENT_PX = 0.5;
const AREA_HIT_SLOP_PX = 4;
/** Baris bergabung ke blok bila jaraknya < rasio ini × tinggi baris terkecil. */
const BLOCK_GAP_RATIO = 0.75;
/** Selisih font-size antar baris di atas rasio ini = batas blok. */
const FONT_JUMP_RATIO = 0.15;
/** Font-size > rasio ini × median body = heading (walau tak ter-outline). */
const HEADING_FONT_RATIO = 1.15;
const LABEL_PREVIEW = 52;
const LIST_MARKER = /^(?:[•‣◦▪–-]|\d{1,3}[.)])\s/;
const SOURCE_LIST_MARKER = /^\s*(?:[-+]\s+|\d{1,3}[.)]\s+)/;
const SOURCE_HEADING = /^\s*=+\s+(.+?)\s*$/;

function clamp01(n: number): number {
	return n < 0 ? 0 : n > 1 ? 1 : n;
}

function preview(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function normalizeText(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

function sourceText(text: string): string {
	return normalizeText(
		text
			.replace(/^\s*=+\s+/, '')
			.replace(SOURCE_LIST_MARKER, '')
			.replace(/\[(.*?)\]/g, '$1')
			.replace(/[*_`]/g, '')
	);
}

function sourceBlockAtLine(
	source: string,
	lineNumber: number,
	outlineTitles: string[]
):
	| (Pick<SemanticBlock, 'kind' | 'label' | 'text'> & {
			sourceStartLine: number;
			sourceEndLine: number;
	  })
	| null {
	const lines = source.split('\n');
	const index = lineNumber - 1;
	const current = lines[index];
	if (current === undefined || !current.trim()) return null;

	const heading = SOURCE_HEADING.exec(current);
	if (heading) {
		const text = sourceText(heading[1]!);
		const outlineTitle = matchesOutlineTitle(text, 1, outlineTitles);
		return {
			kind: 'judul',
			label: outlineTitle ?? preview(text, LABEL_PREVIEW),
			text,
			sourceStartLine: lineNumber,
			sourceEndLine: lineNumber
		};
	}

	if (SOURCE_LIST_MARKER.test(current)) {
		const text = sourceText(current);
		return {
			kind: 'daftar',
			label: preview(text, LABEL_PREVIEW),
			text,
			sourceStartLine: lineNumber,
			sourceEndLine: lineNumber
		};
	}

	let start = index;
	let end = index;
	while (
		start > 0 &&
		lines[start - 1]!.trim() &&
		!SOURCE_HEADING.test(lines[start - 1]!) &&
		!SOURCE_LIST_MARKER.test(lines[start - 1]!)
	) {
		start -= 1;
	}
	while (
		end + 1 < lines.length &&
		lines[end + 1]!.trim() &&
		!SOURCE_HEADING.test(lines[end + 1]!) &&
		!SOURCE_LIST_MARKER.test(lines[end + 1]!)
	) {
		end += 1;
	}
	const text = sourceText(lines.slice(start, end + 1).join(' '));
	if (!text) return null;
	return {
		kind: text.includes(' ') ? 'paragraf' : 'baris',
		label: preview(text, LABEL_PREVIEW),
		text,
		sourceStartLine: start + 1,
		sourceEndLine: end + 1
	};
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
		const rawBlocks = groupLinesIntoBlocks(lines, outlineTitles);
		for (let blockIndex = 0; blockIndex < rawBlocks.length; blockIndex += 1) {
			const raw = rawBlocks[blockIndex]!;
			const rects = raw.lines.map((l) => ({
				x: clamp01((l.left - pageBox.left) / pageBox.width),
				y: clamp01((l.top - pageBox.top) / pageBox.height),
				w: clamp01((l.right - l.left) / pageBox.width),
				h: clamp01((l.bottom - l.top) / pageBox.height)
			}));
			if (rects.length === 0) continue;
			blocks.push({
				page: pageIndex + 1,
				kind: raw.kind,
				label: raw.label,
				text: raw.text,
				rects,
				bbox: unionRect(rects),
				selection: { renderer: 'semantic-layer', start: blockIndex, end: blockIndex }
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

function textRunAtPoint(
	page: Element,
	target: EventTarget | null,
	x: number,
	y: number
): Element | null {
	for (const element of document.elementsFromPoint(x, y)) {
		const run = element.closest('.typst-text');
		if (run && page.contains(run)) return run;
	}
	const targetRun = target instanceof Element ? target.closest('.typst-text') : null;
	if (targetRun && page.contains(targetRun)) return targetRun;
	return null;
}

/** Resolve glyph-only Vedivad SVG through Typst's source map, while using the hit text run as geometry. */
export async function resolveVedivadBlockAtPoint(options: {
	project: TypstProject | null;
	source: string;
	mainFilePath: string;
	svgHost: HTMLElement;
	outlineTitles: string[];
	target: EventTarget | null;
	clientX: number;
	clientY: number;
	cache?: WeakMap<Element, Promise<SemanticBlock | null>>;
}): Promise<SemanticBlock | null> {
	const { project, source, mainFilePath, svgHost, outlineTitles, target, clientX, clientY, cache } =
		options;
	if (!project || !source) return null;
	const pages = pageElements(svgHost);
	for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
		const page = pages[pageIndex]!;
		const pageBox = page.getBoundingClientRect();
		if (
			pageBox.width <= 0 ||
			pageBox.height <= 0 ||
			clientX < pageBox.left ||
			clientX > pageBox.right ||
			clientY < pageBox.top ||
			clientY > pageBox.bottom
		) {
			continue;
		}
		const run = textRunAtPoint(page, target, clientX, clientY);
		if (!run) return null;
		const runs = Array.from(page.querySelectorAll('.typst-text'));
		const runIndex = runs.indexOf(run);
		if (runIndex < 0) return null;
		const cached = cache?.get(run);
		if (cached) return cached;
		const pending = (async (): Promise<SemanticBlock | null> => {
			const svg = page.matches('svg') ? page : page.querySelector('svg');
			if (!(svg instanceof SVGSVGElement)) return null;
			const svgBox = svg.getBoundingClientRect();
			const viewBox = svg.viewBox.baseVal;
			if (svgBox.width <= 0 || svgBox.height <= 0 || viewBox.width <= 0 || viewBox.height <= 0) {
				return null;
			}
			let jump: Awaited<ReturnType<TypstProject['clickJump']>>;
			try {
				jump = await project.clickJump(
					pageIndex,
					((clientX - svgBox.left) / svgBox.width) * viewBox.width,
					((clientY - svgBox.top) / svgBox.height) * viewBox.height
				);
			} catch {
				return null;
			}
			if (jump?.kind !== 'source') return null;
			const normalizedFile = jump.file.startsWith('/') ? jump.file : `/${jump.file}`;
			const normalizedMain = mainFilePath.startsWith('/') ? mainFilePath : `/${mainFilePath}`;
			if (normalizedFile !== normalizedMain) return null;
			const content = sourceBlockAtLine(source, jump.line, outlineTitles);
			if (!content) return null;
			const { sourceStartLine, sourceEndLine, ...semanticContent } = content;
			const rect = run.getBoundingClientRect();
			const normalizedRect = {
				x: clamp01((rect.left - pageBox.left) / pageBox.width),
				y: clamp01((rect.top - pageBox.top) / pageBox.height),
				w: clamp01(rect.width / pageBox.width),
				h: clamp01(rect.height / pageBox.height)
			};
			return {
				page: pageIndex + 1,
				...semanticContent,
				rects: [normalizedRect],
				bbox: normalizedRect,
				selection: {
					renderer: 'vedivad',
					start: runIndex,
					end: runIndex,
					sourceStartLine,
					sourceEndLine
				}
			};
		})();
		cache?.set(run, pending);
		return pending;
	}
	return null;
}

type ClientPoint = { clientX: number; clientY: number };
type ClientRect = { left: number; top: number; right: number; bottom: number };

function dragClientRect(start: ClientPoint, end: ClientPoint): ClientRect {
	return {
		left: Math.min(start.clientX, end.clientX) - AREA_HIT_SLOP_PX,
		top: Math.min(start.clientY, end.clientY) - AREA_HIT_SLOP_PX,
		right: Math.max(start.clientX, end.clientX) + AREA_HIT_SLOP_PX,
		bottom: Math.max(start.clientY, end.clientY) + AREA_HIT_SLOP_PX
	};
}

function intersectsClientRect(a: ClientRect, b: ClientRect): boolean {
	return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function legacyBlockClientRect(block: SemanticBlock, page: Element): ClientRect | null {
	const pageBox = page.getBoundingClientRect();
	if (pageBox.width <= 0 || pageBox.height <= 0) return null;
	return {
		left: pageBox.left + block.bbox.x * pageBox.width,
		top: pageBox.top + block.bbox.y * pageBox.height,
		right: pageBox.left + (block.bbox.x + block.bbox.w) * pageBox.width,
		bottom: pageBox.top + (block.bbox.y + block.bbox.h) * pageBox.height
	};
}

/**
 * Resolve semua blok yang beririsan dengan marquee drag. Endpoint tidak harus berada tepat di
 * atas glyph, sehingga gesture dapat dimulai dan diakhiri dari ruang kosong halaman.
 */
export async function resolveSemanticAreaRange(options: {
	project: TypstProject | null;
	source: string;
	mainFilePath: string;
	svgHost: HTMLElement;
	outlineTitles: string[];
	legacyBlocks: SemanticBlock[];
	start: ClientPoint;
	end: ClientPoint;
	cache?: WeakMap<Element, Promise<SemanticBlock | null>>;
}): Promise<SemanticRangeResult | null> {
	const { project, source, mainFilePath, svgHost, outlineTitles, legacyBlocks, start, end, cache } =
		options;
	const selectionRect = dragClientRect(start, end);
	const pages = pageElements(svgHost);
	const vedivadRuns = Array.from(svgHost.querySelectorAll('.typst-text'));

	if (vedivadRuns.length > 0) {
		const hits: Array<{ page: number; run: Element; index: number }> = [];
		for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
			const page = pages[pageIndex]!;
			const runs = Array.from(page.querySelectorAll('.typst-text'));
			for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
				const run = runs[runIndex]!;
				const rect = run.getBoundingClientRect();
				if (rect.width <= MIN_FRAGMENT_PX || rect.height <= MIN_FRAGMENT_PX) continue;
				if (intersectsClientRect(selectionRect, rect)) {
					hits.push({ page: pageIndex + 1, run, index: runIndex });
				}
			}
		}
		if (hits.length === 0) return null;
		if (new Set(hits.map((hit) => hit.page)).size > 1) {
			return { ok: false, reason: 'different-page' };
		}
		const sorted = hits.toSorted((a, b) => a.index - b.index);
		const first = sorted[0]!;
		const last = sorted[sorted.length - 1]!;
		const resolveRun = (hit: (typeof hits)[number]) => {
			const rect = hit.run.getBoundingClientRect();
			return resolveVedivadBlockAtPoint({
				project,
				source,
				mainFilePath,
				svgHost,
				outlineTitles,
				target: hit.run,
				clientX: rect.left + rect.width / 2,
				clientY: rect.top + rect.height / 2,
				cache
			});
		};
		const [startBlock, endBlock] = await Promise.all([resolveRun(first), resolveRun(last)]);
		if (!startBlock || !endBlock) return null;
		return combineSemanticBlockRange({
			start: startBlock,
			end: endBlock,
			legacyBlocks,
			svgHost,
			source
		});
	}

	const hits = legacyBlocks.filter((block) => {
		const page = pages[block.page - 1];
		if (!page) return false;
		const rect = legacyBlockClientRect(block, page);
		return rect ? intersectsClientRect(selectionRect, rect) : false;
	});
	if (hits.length === 0) return null;
	if (new Set(hits.map((block) => block.page)).size > 1) {
		return { ok: false, reason: 'different-page' };
	}
	const sorted = hits.toSorted((a, b) => {
		if (a.selection.renderer !== 'semantic-layer') return 1;
		if (b.selection.renderer !== 'semantic-layer') return -1;
		return a.selection.start - b.selection.start;
	});
	return combineSemanticBlockRange({
		start: sorted[0]!,
		end: sorted[sorted.length - 1]!,
		legacyBlocks,
		svgHost,
		source
	});
}

function normalizedRunRects(page: Element, start: number, end: number): AnnotationRect[] {
	const pageBox = page.getBoundingClientRect();
	if (pageBox.width <= 0 || pageBox.height <= 0) return [];
	const runs = Array.from(page.querySelectorAll('.typst-text'));
	const rects = runs.slice(start, end + 1).flatMap((run) => {
		const rect = run.getBoundingClientRect();
		if (rect.width <= MIN_FRAGMENT_PX || rect.height <= MIN_FRAGMENT_PX) return [];
		return [
			{
				x: clamp01((rect.left - pageBox.left) / pageBox.width),
				y: clamp01((rect.top - pageBox.top) / pageBox.height),
				w: clamp01(rect.width / pageBox.width),
				h: clamp01(rect.height / pageBox.height)
			}
		];
	});
	return mergeLineRects(rects);
}

function mergeLineRects(rects: AnnotationRect[]): AnnotationRect[] {
	const sorted = rects.toSorted((a, b) => a.y - b.y || a.x - b.x);
	const merged: AnnotationRect[] = [];
	for (const rect of sorted) {
		const current = merged[merged.length - 1];
		if (!current) {
			merged.push({ ...rect });
			continue;
		}
		const sameLine =
			Math.abs(current.y + current.h / 2 - (rect.y + rect.h / 2)) <=
			Math.max(current.h, rect.h) / 2;
		const gap = rect.x - (current.x + current.w);
		if (sameLine && gap <= Math.max(current.h, rect.h) * 0.75) {
			const right = Math.max(current.x + current.w, rect.x + rect.w);
			const bottom = Math.max(current.y + current.h, rect.y + rect.h);
			current.x = Math.min(current.x, rect.x);
			current.y = Math.min(current.y, rect.y);
			current.w = right - current.x;
			current.h = bottom - current.y;
			continue;
		}
		merged.push({ ...rect });
	}
	return merged;
}

function selectedSourceText(source: string, startLine: number, endLine: number): string {
	return normalizeText(
		source
			.split('\n')
			.slice(startLine - 1, endLine)
			.map(sourceText)
			.filter(Boolean)
			.join(' ')
	);
}

function sameSemanticSelection(start: SemanticBlock, end: SemanticBlock): boolean {
	if (start.selection.renderer !== end.selection.renderer) return false;
	if (
		start.selection.renderer === 'semantic-layer' &&
		end.selection.renderer === 'semantic-layer'
	) {
		return (
			start.selection.start === end.selection.start && start.selection.end === end.selection.end
		);
	}
	if (start.selection.renderer === 'vedivad' && end.selection.renderer === 'vedivad') {
		return (
			start.selection.sourceStartLine === end.selection.sourceStartLine &&
			start.selection.sourceEndLine === end.selection.sourceEndLine
		);
	}
	return false;
}

/** Gabungkan dua endpoint drag menjadi satu blok kontigu tanpa mengubah contract annotation. */
export function combineSemanticBlockRange(options: {
	start: SemanticBlock;
	end: SemanticBlock;
	legacyBlocks: SemanticBlock[];
	svgHost: HTMLElement;
	source: string;
}): SemanticRangeResult {
	const { start, end, legacyBlocks, svgHost, source } = options;
	if (start.page !== end.page) return { ok: false, reason: 'different-page' };
	if (start.selection.renderer !== end.selection.renderer) {
		return { ok: false, reason: 'incompatible' };
	}

	let rects: AnnotationRect[];
	let text: string;
	let selection: SemanticBlockSelection;
	if (
		start.selection.renderer === 'semantic-layer' &&
		end.selection.renderer === 'semantic-layer'
	) {
		const from = Math.min(start.selection.start, end.selection.start);
		const to = Math.max(start.selection.end, end.selection.end);
		const blocks = legacyBlocks.filter((block) => {
			return (
				block.page === start.page &&
				block.selection.renderer === 'semantic-layer' &&
				block.selection.start >= from &&
				block.selection.end <= to
			);
		});
		if (blocks.length === 0) return { ok: false, reason: 'incompatible' };
		rects = blocks.flatMap((block) => block.rects);
		text = normalizeText(blocks.map((block) => block.text).join(' '));
		selection = { renderer: 'semantic-layer', start: from, end: to };
	} else if (start.selection.renderer === 'vedivad' && end.selection.renderer === 'vedivad') {
		const from = Math.min(start.selection.start, end.selection.start);
		const to = Math.max(start.selection.end, end.selection.end);
		const page = pageElements(svgHost)[start.page - 1];
		if (!page) return { ok: false, reason: 'incompatible' };
		rects = normalizedRunRects(page, from, to);
		const sourceStartLine = Math.min(
			start.selection.sourceStartLine,
			end.selection.sourceStartLine
		);
		const sourceEndLine = Math.max(start.selection.sourceEndLine, end.selection.sourceEndLine);
		text = selectedSourceText(source, sourceStartLine, sourceEndLine);
		selection = {
			renderer: 'vedivad',
			start: from,
			end: to,
			sourceStartLine,
			sourceEndLine
		};
	} else {
		return { ok: false, reason: 'incompatible' };
	}

	if (!text || rects.length === 0) return { ok: false, reason: 'incompatible' };
	const isSingleBlock = sameSemanticSelection(start, end);
	return {
		ok: true,
		block: {
			page: start.page,
			kind: isSingleBlock ? start.kind : 'pilihan',
			label: isSingleBlock ? start.label : preview(text, LABEL_PREVIEW),
			text,
			rects,
			bbox: unionRect(rects),
			selection
		}
	};
}

export function blockToDraft(block: SemanticBlock): AnnotationDraft {
	return { selectedText: block.text, page: block.page, rects: block.rects };
}
