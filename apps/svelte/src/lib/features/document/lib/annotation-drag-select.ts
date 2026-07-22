import type { TypstProject } from '@vedivad/codemirror-typst';
import { pageElements, type AnnotationRect } from './annotation-selection';
import type {
	SemanticBlock,
	SemanticBlockSelection,
	SemanticRangeResult
} from './annotation-target-types';
import { resolveVedivadBlockAtPoint } from './annotation-hit-test';
import {
	AREA_HIT_SLOP_PX,
	clamp01,
	LABEL_PREVIEW,
	MIN_FRAGMENT_PX,
	normalizeText,
	preview,
	sourceText,
	unionRect
} from './annotation-target-utils';

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
