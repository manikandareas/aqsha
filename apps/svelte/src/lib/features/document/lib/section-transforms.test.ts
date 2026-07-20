import { describe, expect, it } from 'vitest';
import {
	insertSection,
	listHeadingBlocks,
	moveSection,
	removeSection,
	renameSection
} from './section-transforms';

const PREAMBLE = '#set text(lang: "id")\n\n';
const doc = (...bab: string[]) => PREAMBLE + bab.join('');
const bab = (title: string, body = '') => `= ${title}\n${body ? `${body}\n` : ''}\n`;

describe('listHeadingBlocks', () => {
	it('memetakan tiap bab ke rentang antar heading level-1', () => {
		const source = doc(bab('Pendahuluan', 'Latar.'), bab('Penutup', 'Akhir.'));
		const blocks = listHeadingBlocks(source);
		expect(blocks.map((b) => b.title)).toEqual(['Pendahuluan', 'Penutup']);
		expect(blocks[0]!.from).toBe(PREAMBLE.length);
		expect(blocks[1]!.to).toBe(source.length);
		// Rentang blok pertama menyentuh awal blok kedua.
		expect(blocks[0]!.to).toBe(blocks[1]!.from);
		// Substring blok mengembalikan teks bab utuh.
		expect(source.slice(blocks[0]!.from, blocks[0]!.to)).toBe(bab('Pendahuluan', 'Latar.'));
	});

	it('mengabaikan heading level ≥2 dan mengembalikan kosong tanpa bab', () => {
		expect(listHeadingBlocks('== Sub\nisi').map((b) => b.title)).toEqual([]);
		expect(listHeadingBlocks('paragraf biasa')).toEqual([]);
	});
});

describe('insertSection', () => {
	it('menyisipkan setelah blok yang ditunjuk', () => {
		const source = doc(bab('A'), bab('C'));
		const out = insertSection(source, 0, 'B');
		expect(listHeadingBlocks(out).map((b) => b.title)).toEqual(['A', 'B', 'C']);
	});

	it('afterIndex -1 menyisipkan sebagai bab pertama tanpa menyentuh preamble', () => {
		const source = doc(bab('A'));
		const out = insertSection(source, -1, 'Awal');
		expect(out.startsWith(PREAMBLE)).toBe(true);
		expect(listHeadingBlocks(out).map((b) => b.title)).toEqual(['Awal', 'A']);
	});

	it('menambah di akhir + memberi newline saat dokumen tak diakhiri newline', () => {
		const source = '#set page()'; // tanpa heading, tanpa newline akhir
		const out = insertSection(source, 0, 'Bab');
		expect(out).toBe('#set page()\n= Bab\n\n');
		expect(listHeadingBlocks(out).map((b) => b.title)).toEqual(['Bab']);
	});
});

describe('moveSection', () => {
	it('memindahkan blok terakhir ke tengah tanpa menempelkan heading', () => {
		const source = doc(bab('A'), bab('B'), bab('C', 'tanpa newline akhir').replace(/\n$/, ''));
		const out = moveSection(source, 2, 0);
		const titles = listHeadingBlocks(out).map((b) => b.title);
		expect(titles).toEqual(['C', 'A', 'B']);
	});

	it('no-op untuk indeks sama / tak valid', () => {
		const source = doc(bab('A'), bab('B'));
		expect(moveSection(source, 1, 1)).toBe(source);
		expect(moveSection(source, 0, 5)).toBe(source);
		expect(moveSection(source, -1, 0)).toBe(source);
	});
});

describe('renameSection', () => {
	it('mengganti judul tanpa mengubah isi bab', () => {
		const source = doc(bab('Lama', 'isi bab'));
		const out = renameSection(source, 0, 'Baru');
		expect(out).toBe(doc(bab('Baru', 'isi bab')));
	});

	it('no-op untuk indeks di luar rentang', () => {
		const source = doc(bab('A'));
		expect(renameSection(source, 3, 'X')).toBe(source);
	});
});

describe('removeSection', () => {
	it('menghapus blok pertama, menyisakan preamble + sisa bab', () => {
		const source = doc(bab('A', 'a'), bab('B', 'b'));
		const out = removeSection(source, 0);
		expect(out).toBe(doc(bab('B', 'b')));
	});

	it('menghapus blok terakhir', () => {
		const source = doc(bab('A', 'a'), bab('B', 'b'));
		const out = removeSection(source, 1);
		expect(listHeadingBlocks(out).map((b) => b.title)).toEqual(['A']);
	});

	it('no-op untuk indeks tak valid', () => {
		const source = doc(bab('A'));
		expect(removeSection(source, 9)).toBe(source);
	});
});
