import { describe, expect, it } from 'vitest';
import { clientRectsToPdfRects, mergeAdjacentRects, pdfRectToCss } from './annotation-geometry';

const box = (x: number, y: number, w: number, h: number) =>
	({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h }) as DOMRect;

describe('clientRectsToPdfRects', () => {
	it('mengonversi rect layar → PDF point relatif halaman (bagi skala)', () => {
		// Halaman dirender 1190px untuk lebar dasar 595pt → scale 2.
		const rects = clientRectsToPdfRects([box(120, 240, 200, 24)], box(20, 40, 1190, 1684), 2);
		expect(rects[0]).toEqual({ x: 50, y: 100, w: 100, h: 12 });
	});
});

describe('mergeAdjacentRects', () => {
	it('menggabung rect satu baris yang saling menempel', () => {
		const merged = mergeAdjacentRects([
			{ x: 10, y: 100, w: 50, h: 12 },
			{ x: 60, y: 100.4, w: 40, h: 12 }
		]);
		expect(merged.length).toBe(1);
		expect(merged[0]!.w).toBeCloseTo(90, 0);
	});

	it('baris berbeda tetap terpisah', () => {
		const merged = mergeAdjacentRects([
			{ x: 10, y: 100, w: 50, h: 12 },
			{ x: 10, y: 120, w: 50, h: 12 }
		]);
		expect(merged.length).toBe(2);
	});
});

describe('pdfRectToCss', () => {
	it('mengembalikan px CSS pada skala render', () => {
		expect(pdfRectToCss({ x: 50, y: 100, w: 100, h: 12 }, 2)).toEqual({
			left: 100,
			top: 200,
			width: 200,
			height: 24
		});
	});
});
