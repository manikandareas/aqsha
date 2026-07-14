import { describe, expect, it } from 'vitest';
import { formatCount, formatIdr, planFeatureRows, priceFootnote, priceLabel } from './pricing';

describe('pricing formatters', () => {
	it('formatIdr → simbol Rp tanpa spasi', () => {
		expect(formatIdr(49_000)).toBe('Rp49.000');
		expect(formatIdr(3_490_000)).toBe('Rp3.490.000');
	});

	it('formatCount → grouping id-ID', () => {
		expect(formatCount(150)).toBe('150');
		expect(formatCount(1_500)).toBe('1.500');
		expect(formatCount(10_000)).toBe('10.000');
	});
});

describe('priceLabel', () => {
	it('Gratis untuk plan 0; harga bulanan/tahunan untuk berbayar', () => {
		expect(priceLabel('free', 'monthly')).toBe('Gratis');
		expect(priceLabel('free', 'annual')).toBe('Gratis');
		expect(priceLabel('starter', 'monthly')).toBe('Rp49.000');
		expect(priceLabel('starter', 'annual')).toBe('Rp490.000');
		expect(priceLabel('ultra', 'monthly')).toBe('Rp349.000');
	});
});

describe('planFeatureRows', () => {
	it('Free → angka konkret', () => {
		const rows = planFeatureRows('free');
		expect(rows).toEqual([
			{ label: 'Credits / bln', value: '150' },
			{ label: 'Deep Research', value: '2' },
			{ label: 'Workspace', value: '1' },
			{ label: 'Library items', value: '25' }
		]);
	});

	it('Ultra → ∞ untuk limit tak-terhingga', () => {
		const rows = planFeatureRows('ultra');
		expect(rows.find((r) => r.label === 'Deep Research')?.value).toBe('∞');
		expect(rows.find((r) => r.label === 'Workspace')?.value).toBe('∞');
		expect(rows.find((r) => r.label === 'Library items')?.value).toBe('∞');
	});
});

describe('priceFootnote', () => {
	it('bulanan free → tanpa kartu; bulanan berbayar → info tahunan', () => {
		expect(priceFootnote('free', 'monthly')).toBe('tanpa kartu');
		expect(priceFootnote('starter', 'monthly')).toBe('tahunan: Rp490.000');
		expect(priceFootnote('starter', 'annual')).toBe('ditagih sekali setahun');
	});
});
