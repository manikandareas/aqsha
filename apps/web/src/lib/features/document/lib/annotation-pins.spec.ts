import { describe, expect, it } from 'vitest';
import { placePins, type PinCandidate } from './annotation-pins';

function pin(id: string, page: number, top: number): PinCandidate {
	return { id, page, top, left: 100, status: 'open', floating: false };
}

describe('placePins', () => {
	it('menomori mengikuti urutan halaman lalu posisi vertikal', () => {
		const placed = placePins([pin('c', 2, 10), pin('a', 1, 300), pin('b', 1, 40)]);
		expect(placed.map((p) => p.id)).toEqual(['b', 'a', 'c']);
		expect(placed.map((p) => p.number)).toEqual([1, 2, 3]);
	});

	it('menggeser pin yang terlalu rapat agar tak menumpuk', () => {
		const placed = placePins([pin('a', 1, 100), pin('b', 1, 108)], { minGap: 26 });
		expect(placed[0]!.top).toBe(100);
		expect(placed[1]!.top).toBe(126);
	});

	it('tidak menggeser pin yang sudah cukup renggang', () => {
		const placed = placePins([pin('a', 1, 100), pin('b', 1, 200)], { minGap: 26 });
		expect(placed[1]!.top).toBe(200);
	});

	it('menghitung jarak per halaman, bukan lintas halaman', () => {
		const placed = placePins([pin('a', 1, 400), pin('b', 2, 10)], { minGap: 26 });
		expect(placed[1]!.top).toBe(10);
	});

	it('mempertahankan status dan penanda melayang', () => {
		const placed = placePins([{ ...pin('a', 1, 10), status: 'sent', floating: true }]);
		expect(placed[0]).toMatchObject({ status: 'sent', floating: true, number: 1 });
	});

	it('mengembalikan daftar kosong untuk masukan kosong', () => {
		expect(placePins([])).toEqual([]);
	});
});
