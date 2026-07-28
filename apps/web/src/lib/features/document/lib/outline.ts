/**
 * Kerangka bab dari sumber Typst. typst.ts stock tidak mengekspos peta span→baris, jadi navigasi
 * editor↔preview beroperasi di level heading: parse heading level-1 (`= Judul`) dari sumber →
 * `sourceLine` (untuk lompat editor) + judul (untuk mencari teks di SVG preview). Murni supaya
 * bisa diuji di node.
 */

export type DocumentOutlineEntry = {
	/** Teks judul bab (setelah `= `). */
	title: string;
	/** Baris sumber 1-based tempat heading berada. */
	sourceLine: number;
};

// `=` tunggal di awal baris + spasi + judul. `(?!=)` menolak `==` (heading level ≥2 bukan bab).
const HEADING_RE = /^=(?!=)[ \t]+(\S.*?)[ \t]*$/;

/** Heading level-1 (`= …`) dari sumber Typst, terurut sesuai kemunculan. */
export function parseDocumentOutline(source: string): DocumentOutlineEntry[] {
	const entries: DocumentOutlineEntry[] = [];
	const lines = source.split('\n');
	for (let i = 0; i < lines.length; i += 1) {
		const m = HEADING_RE.exec(lines[i]!);
		if (m) entries.push({ title: m[1]!, sourceLine: i + 1 });
	}
	return entries;
}

/**
 * Normalisasi teks untuk mencocokkan judul bab dengan konten SVG preview. Lapisan teks Typst bisa
 * memecah kata jadi banyak node (spasi tak konsisten) → buang seluruh whitespace + lowercase.
 */
export function normalizeHeadingText(text: string): string {
	return text.replace(/\s+/g, '').toLowerCase();
}
