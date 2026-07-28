import { describe, expect, it } from 'vitest';
import {
	groupFragmentsIntoLines,
	groupLinesIntoBlocks,
	type TextFragment
} from './annotation-hover-targets';

function frag(
	left: number,
	top: number,
	width: number,
	height: number,
	text: string,
	fontSize = 12
): TextFragment {
	return { left, top, right: left + width, bottom: top + height, text, fontSize };
}

describe('groupFragmentsIntoLines', () => {
	it('menggabungkan fragmen yang tumpang-tindih vertikal jadi satu baris, urut kiri→kanan', () => {
		const lines = groupFragmentsIntoLines([
			frag(120, 100, 80, 14, 'dua'),
			frag(20, 101, 90, 13, 'Bagian'),
			frag(20, 140, 200, 14, 'Baris berikutnya')
		]);
		expect(lines).toHaveLength(2);
		expect(lines[0]?.text).toBe('Bagian dua');
		expect(lines[0]?.left).toBe(20);
		expect(lines[0]?.right).toBe(200);
		expect(lines[1]?.text).toBe('Baris berikutnya');
	});

	it('memisahkan baris yang tidak tumpang-tindih', () => {
		const lines = groupFragmentsIntoLines([
			frag(20, 100, 100, 14, 'a'),
			frag(20, 130, 100, 14, 'b')
		]);
		expect(lines).toHaveLength(2);
	});
});

describe('groupLinesIntoBlocks', () => {
	const body = (top: number, text: string) => frag(20, top, 300, 14, text, 12);

	it('menggabungkan baris rapat jadi satu paragraf, gap besar memisahkan blok', () => {
		const blocks = groupLinesIntoBlocks(
			[
				body(100, 'Kalimat pertama paragraf.'),
				body(118, 'Kalimat kedua paragraf.'),
				// gap 40px > 0.75 × 14 → blok baru
				body(172, 'Paragraf kedua dimulai di sini.')
			],
			[]
		);
		expect(blocks).toHaveLength(2);
		expect(blocks[0]?.kind).toBe('paragraf');
		expect(blocks[0]?.text).toBe('Kalimat pertama paragraf. Kalimat kedua paragraf.');
		expect(blocks[1]?.text).toBe('Paragraf kedua dimulai di sini.');
	});

	it('lonjakan font-size memisahkan blok dan diklasifikasi judul', () => {
		const blocks = groupLinesIntoBlocks(
			[
				frag(20, 100, 200, 20, 'Metode Penelitian', 18),
				body(126, 'Paragraf isi yang menjelaskan metode.'),
				body(144, 'Lanjutan paragraf isi.')
			],
			[]
		);
		expect(blocks).toHaveLength(2);
		expect(blocks[0]?.kind).toBe('judul');
		expect(blocks[1]?.kind).toBe('paragraf');
	});

	it('mencocokkan judul dengan outlineTitles (case-insensitive) dan memakai title sebagai label', () => {
		const blocks = groupLinesIntoBlocks(
			[frag(20, 100, 200, 20, '1. Pendahuluan', 18), body(126, 'Isi bab pendahuluan di sini.')],
			['Pendahuluan']
		);
		expect(blocks[0]?.kind).toBe('judul');
		expect(blocks[0]?.label).toBe('Pendahuluan');
	});

	it('mengenali penanda daftar', () => {
		const blocks = groupLinesIntoBlocks([body(100, '• butir pertama daftar')], []);
		expect(blocks[0]?.kind).toBe('daftar');
	});

	it('baris tunggal satu kata → baris', () => {
		const blocks = groupLinesIntoBlocks([body(100, 'Lampiran')], []);
		expect(blocks[0]?.kind).toBe('baris');
	});

	it('label paragraf panjang terpotong dengan ellipsis', () => {
		const long = 'Kata '.repeat(30).trim();
		const blocks = groupLinesIntoBlocks([body(100, long)], []);
		expect(blocks[0]?.label.length).toBeLessThanOrEqual(52);
		expect(blocks[0]?.label.endsWith('…')).toBe(true);
	});
});
