import type { TypstProject } from '@vedivad/codemirror-typst';
import { pageElements } from './annotation-selection';
import type { SemanticBlock } from './annotation-target-types';
import { clamp01, sourceBlockAtLine } from './annotation-target-utils';

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
