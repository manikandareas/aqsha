// Cover generatif deterministik untuk kartu paper/berita/changelog. Warna brand dipilih dari hash
// judul + inisial ghost besar + chip label. Helpers pure (hash/initial/gradient) dipisah dari
// komponen agar contract-testable (deterministik).

// Palet gradien brand — indeks dipilih deterministik dari hash judul.
export const COVER_GRADIENTS = [
	'linear-gradient(145deg, oklch(0.55 0.15 154), oklch(0.31 0.10 154))', // mint
	'linear-gradient(145deg, oklch(0.52 0.14 248), oklch(0.30 0.10 248))', // sky
	'linear-gradient(145deg, oklch(0.52 0.13 305), oklch(0.30 0.10 305))', // lavender
	'linear-gradient(145deg, oklch(0.56 0.15 34), oklch(0.33 0.11 34))', // coral
	'linear-gradient(145deg, oklch(0.50 0.07 70), oklch(0.30 0.05 70))' // warm gold/ink
];

export function hashIndex(value: string, mod: number): number {
	let h = 0;
	for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
	return Math.abs(h) % mod;
}

/**
 * Inisial pertama (huruf besar) dari teks; fallback "•" untuk teks kosong. Iterasi per code point
 * (spread), bukan indeks UTF-16, supaya judul berawalan emoji/aksara astral tak terpotong surrogate.
 */
export function firstInitial(text: string): string {
	return ([...text.trim()][0] ?? '•').toUpperCase();
}
