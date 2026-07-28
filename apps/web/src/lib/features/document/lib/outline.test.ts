import { describe, expect, it } from 'vitest';
import { normalizeHeadingText, parseDocumentOutline } from './outline';

describe('parseDocumentOutline', () => {
	it('mengumpulkan heading level-1 dengan baris sumber 1-based', () => {
		const source = ['#set text(lang: "id")', '', '= Pendahuluan', 'Isi bab.', '', '= Penutup'].join(
			'\n'
		);
		expect(parseDocumentOutline(source)).toEqual([
			{ title: 'Pendahuluan', sourceLine: 3 },
			{ title: 'Penutup', sourceLine: 6 }
		]);
	});

	it('mengabaikan heading level ≥2', () => {
		const source = ['= Bab', '== Subbab', '=== Sub-subbab'].join('\n');
		expect(parseDocumentOutline(source)).toEqual([{ title: 'Bab', sourceLine: 1 }]);
	});

	it('menuntut spasi setelah tanda sama dengan', () => {
		const source = ['=tanpa spasi', '= Dengan spasi'].join('\n');
		expect(parseDocumentOutline(source)).toEqual([{ title: 'Dengan spasi', sourceLine: 2 }]);
	});

	it('memangkas spasi ekor judul', () => {
		expect(parseDocumentOutline('=   Tinjauan Pustaka   ')).toEqual([
			{ title: 'Tinjauan Pustaka', sourceLine: 1 }
		]);
	});

	it('mengembalikan array kosong tanpa heading', () => {
		expect(parseDocumentOutline('Hanya paragraf biasa.\nTanpa bab.')).toEqual([]);
	});
});

describe('normalizeHeadingText', () => {
	it('membuang whitespace dan menyeragamkan huruf', () => {
		expect(normalizeHeadingText('Tinjauan  Pustaka')).toBe('tinjauanpustaka');
		expect(normalizeHeadingText('  PENDAHULUAN\n')).toBe('pendahuluan');
	});
});
