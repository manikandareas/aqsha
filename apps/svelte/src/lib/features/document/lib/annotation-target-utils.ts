import type { AnnotationRect } from './annotation-selection';
import type { SemanticBlock } from './annotation-target-types';

export const MIN_FRAGMENT_PX = 0.5;
export const AREA_HIT_SLOP_PX = 4;
/** Baris bergabung ke blok bila jaraknya < rasio ini × tinggi baris terkecil. */
export const BLOCK_GAP_RATIO = 0.75;
/** Selisih font-size antar baris di atas rasio ini = batas blok. */
export const FONT_JUMP_RATIO = 0.15;
/** Font-size > rasio ini × median body = heading (walau tak ter-outline). */
export const HEADING_FONT_RATIO = 1.15;
export const LABEL_PREVIEW = 52;
export const LIST_MARKER = /^(?:[•‣◦▪–-]|\d{1,3}[.)])\s/;
const SOURCE_LIST_MARKER = /^\s*(?:[-+]\s+|\d{1,3}[.)]\s+)/;
const SOURCE_HEADING = /^\s*=+\s+(.+?)\s*$/;

export function clamp01(n: number): number {
	return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function preview(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function normalizeText(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

export function sourceText(text: string): string {
	return normalizeText(
		text
			.replace(/^\s*=+\s+/, '')
			.replace(SOURCE_LIST_MARKER, '')
			.replace(/\[(.*?)\]/g, '$1')
			.replace(/[*_`]/g, '')
	);
}

export function sourceBlockAtLine(
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

export function matchesOutlineTitle(
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

export function unionRect(rects: AnnotationRect[]): AnnotationRect {
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
