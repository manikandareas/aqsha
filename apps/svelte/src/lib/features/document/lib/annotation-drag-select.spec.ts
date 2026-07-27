import { describe, expect, it } from 'vitest';
import { anchorPageNumber } from './annotation-drag-select';

/** Halaman palsu: `anchorPageNumber` hanya membaca `getBoundingClientRect`. */
function page(top: number, bottom: number): Element {
	return { getBoundingClientRect: () => ({ top, bottom }) } as unknown as Element;
}

// Dua lembar dengan jarak 16px di antaranya, seperti preview sesudah halaman dipisah.
const PAGES = [page(0, 500), page(516, 1016)];

describe('anchorPageNumber', () => {
	it('memilih halaman yang memuat titik awal', () => {
		expect(anchorPageNumber(PAGES, { clientX: 0, clientY: 250 }, 1)).toBe(1);
		expect(anchorPageNumber(PAGES, { clientX: 0, clientY: 700 }, 1)).toBe(2);
	});

	it('memilih halaman terdekat saat titik awal jatuh di sela antar halaman', () => {
		expect(anchorPageNumber(PAGES, { clientX: 0, clientY: 504 }, 2)).toBe(1);
		expect(anchorPageNumber(PAGES, { clientX: 0, clientY: 513 }, 1)).toBe(2);
	});

	it('menjepit ke halaman pertama saat titik awal di atas dokumen', () => {
		expect(anchorPageNumber(PAGES, { clientX: 0, clientY: -80 }, 2)).toBe(1);
	});

	it('menjepit ke halaman terakhir saat titik awal di bawah dokumen', () => {
		expect(anchorPageNumber(PAGES, { clientX: 0, clientY: 2000 }, 1)).toBe(2);
	});

	it('memakai fallback saat belum ada halaman ter-render', () => {
		expect(anchorPageNumber([], { clientX: 0, clientY: 10 }, 3)).toBe(3);
	});

	it('tepi halaman dihitung sebagai bagian halaman itu', () => {
		expect(anchorPageNumber(PAGES, { clientX: 0, clientY: 500 }, 2)).toBe(1);
		expect(anchorPageNumber(PAGES, { clientX: 0, clientY: 516 }, 1)).toBe(2);
	});
});
