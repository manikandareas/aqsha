import type { AnnotationRect } from '../api';

/** Rect layar (client) → PDF point relatif halaman: geser ke origin halaman lalu bagi skala render. */
export function clientRectsToPdfRects(
	rects: DOMRect[],
	pageBox: DOMRect,
	scale: number
): AnnotationRect[] {
	return rects
		.filter((r) => r.width > 0.5 && r.height > 0.5)
		.map((r) => ({
			x: (r.left - pageBox.left) / scale,
			y: (r.top - pageBox.top) / scale,
			w: r.width / scale,
			h: r.height / scale
		}));
}

/** Gabung rect seleksi satu baris (getClientRects per-span pecah-pecah) → satu rect per baris. */
export function mergeAdjacentRects(rects: AnnotationRect[]): AnnotationRect[] {
	const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
	const merged: AnnotationRect[] = [];
	for (const rect of sorted) {
		const last = merged[merged.length - 1];
		const sameLine = last && Math.abs(last.y - rect.y) < rect.h * 0.5;
		const touching = last && rect.x <= last.x + last.w + 2;
		if (last && sameLine && touching) {
			const right = Math.max(last.x + last.w, rect.x + rect.w);
			last.w = right - last.x;
			last.h = Math.max(last.h, rect.h);
		} else {
			merged.push({ ...rect });
		}
	}
	return merged;
}

export function pdfRectToCss(
	rect: AnnotationRect,
	scale: number
): { left: number; top: number; width: number; height: number } {
	return {
		left: rect.x * scale,
		top: rect.y * scale,
		width: rect.w * scale,
		height: rect.h * scale
	};
}
