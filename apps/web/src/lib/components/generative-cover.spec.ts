import { describe, expect, it } from 'vitest';
import { COVER_GRADIENTS, firstInitial, hashIndex } from './generative-cover';

describe('hashIndex', () => {
	it('deterministik + selalu dalam [0, mod)', () => {
		const a = hashIndex('Rilis pertama Aqsha', COVER_GRADIENTS.length);
		const b = hashIndex('Rilis pertama Aqsha', COVER_GRADIENTS.length);
		expect(a).toBe(b);
		expect(a).toBeGreaterThanOrEqual(0);
		expect(a).toBeLessThan(COVER_GRADIENTS.length);
	});

	it('judul berbeda → indeks bisa berbeda (bukan konstanta)', () => {
		const indices = new Set(
			['satu', 'dua', 'tiga', 'empat', 'lima'].map((t) => hashIndex(t, COVER_GRADIENTS.length))
		);
		expect(indices.size).toBeGreaterThan(1);
	});
});

describe('firstInitial', () => {
	it('huruf pertama kapital; trim; fallback •', () => {
		expect(firstInitial('halo dunia')).toBe('H');
		expect(firstInitial('  aqsha')).toBe('A');
		expect(firstInitial('')).toBe('•');
		expect(firstInitial('   ')).toBe('•');
	});

	it('iterasi per code point (aksara astral tak terpotong surrogate)', () => {
		expect(firstInitial('émile')).toBe('É');
		// Emoji sebagai code point tunggal (bukan setengah surrogate).
		expect(firstInitial('🚀 rocket')).toBe('🚀');
	});
});
