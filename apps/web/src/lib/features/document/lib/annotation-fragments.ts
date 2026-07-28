import { pageElements } from './annotation-selection';
import type {
	Line,
	RawBlock,
	SemanticBlock,
	SemanticBlockKind,
	TextFragment
} from './annotation-target-types';
import {
	BLOCK_GAP_RATIO,
	clamp01,
	FONT_JUMP_RATIO,
	HEADING_FONT_RATIO,
	LABEL_PREVIEW,
	LIST_MARKER,
	matchesOutlineTitle,
	MIN_FRAGMENT_PX,
	normalizeText,
	preview,
	unionRect
} from './annotation-target-utils';

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

/** Cache this normalized index across scrolls; DOM geometry reads make rebuilding expensive. */
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
