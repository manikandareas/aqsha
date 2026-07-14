import { describe, expect, it } from 'vitest';
import { computeScrollProgress, mapRange } from './scroll-math';

describe('computeScrollProgress', () => {
	const vh = 800;
	const h = 200;

	it('canonical ["start end","end start"] → 0 saat top di viewport bottom, 1 saat bottom di top', () => {
		const offset = ['start end', 'end start'] as [string, string];
		expect(computeScrollProgress({ top: vh, height: h }, vh, offset)).toBe(0);
		expect(computeScrollProgress({ top: -h, height: h }, vh, offset)).toBe(1);
		// Midpoint: top=300 → (vh-300)/(vh+h) = 500/1000 = 0.5
		expect(computeScrollProgress({ top: 300, height: h }, vh, offset)).toBeCloseTo(0.5, 5);
	});

	it('LedgerRow offset ["start 0.75","start 0.45"] → strike 0..1 across viewport band', () => {
		const offset = ['start 0.75', 'start 0.45'] as [string, string];
		expect(computeScrollProgress({ top: 0.75 * vh, height: h }, vh, offset)).toBe(0);
		expect(computeScrollProgress({ top: 0.45 * vh, height: h }, vh, offset)).toBe(1);
	});

	it('clamps to [0,1] di luar rentang', () => {
		const offset = ['start end', 'end start'] as [string, string];
		expect(computeScrollProgress({ top: vh + 500, height: h }, vh, offset)).toBe(0);
		expect(computeScrollProgress({ top: -h - 500, height: h }, vh, offset)).toBe(1);
	});
});

describe('mapRange', () => {
	it('interpolasi linier + clamp', () => {
		expect(mapRange(0, [0, 1], [0.965, 1])).toBeCloseTo(0.965, 5);
		expect(mapRange(1, [0, 1], [0.965, 1])).toBeCloseTo(1, 5);
		expect(mapRange(0.5, [0, 1], [0, 10])).toBeCloseTo(5, 5);
		// Sub-range (FeatureFrame scale [0,0.35]) → clamp di atas 0.35
		expect(mapRange(1, [0, 0.35], [0.965, 1])).toBeCloseTo(1, 5);
		// Rentang input degenerate → output awal
		expect(mapRange(5, [2, 2], [3, 9])).toBe(3);
	});
});
