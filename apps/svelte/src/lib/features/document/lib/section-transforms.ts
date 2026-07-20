/**
 * Transformasi bab murni atas sumber Typst. Bab = blok teks antar heading level-1 (`= …`). Preamble
 * sebelum heading pertama tidak pernah tersentuh. Semua operasi mengembalikan sumber baru (tanpa
 * efek samping) supaya bisa diterapkan ke editor sebagai satu edit user (memicu autosave + recompile).
 */

// `=` tunggal di awal baris (bukan `==`) + spasi + judul.
const HEADING_RE = /^=(?!=)[ \t]+(\S.*?)[ \t]*$/;

export type HeadingBlock = {
	title: string;
	/** Offset karakter awal blok (awal baris heading). */
	from: number;
	/** Offset karakter akhir blok (awal blok berikutnya, atau akhir dokumen). */
	to: number;
};

/** Offset awal tiap baris pada `source`. */
function lineStarts(source: string): number[] {
	const starts = [0];
	for (let i = 0; i < source.length; i += 1) {
		if (source[i] === '\n') starts.push(i + 1);
	}
	return starts;
}

/** Blok bab (heading level-1) beserta rentang offset-nya, terurut. */
export function listHeadingBlocks(source: string): HeadingBlock[] {
	const starts = lineStarts(source);
	const heads: { title: string; from: number }[] = [];
	const lines = source.split('\n');
	for (let i = 0; i < lines.length; i += 1) {
		const m = HEADING_RE.exec(lines[i]!);
		if (m) heads.push({ title: m[1]!, from: starts[i]! });
	}
	return heads.map((h, idx) => ({
		title: h.title,
		from: h.from,
		to: idx + 1 < heads.length ? heads[idx + 1]!.from : source.length
	}));
}

function headingLine(title: string): string {
	return `= ${title}\n\n`;
}

/**
 * Sisipkan bab baru setelah blok indeks `afterIndex` (`-1` = jadi bab pertama, setelah preamble).
 * Tanpa heading = disisipkan di akhir dokumen.
 */
export function insertSection(source: string, afterIndex: number, title: string): string {
	const blocks = listHeadingBlocks(source);
	let at: number;
	if (blocks.length === 0) at = source.length;
	else if (afterIndex < 0) at = blocks[0]!.from;
	else at = blocks[Math.min(afterIndex, blocks.length - 1)]!.to;
	// Batas blok selalu di awal baris → char sebelum `at` pasti '\n' kecuali saat menempel di akhir
	// dokumen yang tak diakhiri newline.
	const prefix = at > 0 && source[at - 1] !== '\n' ? '\n' : '';
	return source.slice(0, at) + prefix + headingLine(title) + source.slice(at);
}

/** Pindahkan blok `fromIndex` ke posisi `toIndex` (no-op bila indeks tak valid / sama). */
export function moveSection(source: string, fromIndex: number, toIndex: number): string {
	const blocks = listHeadingBlocks(source);
	if (
		blocks.length === 0 ||
		fromIndex === toIndex ||
		fromIndex < 0 ||
		toIndex < 0 ||
		fromIndex >= blocks.length ||
		toIndex >= blocks.length
	) {
		return source;
	}
	const preamble = source.slice(0, blocks[0]!.from);
	// Setiap blok diakhiri newline saat digabung agar heading berikutnya tak menempel di baris yang sama
	// (blok terakhir bisa tak berakhiran newline).
	const texts = blocks.map((b) => {
		const t = source.slice(b.from, b.to);
		return t.endsWith('\n') ? t : `${t}\n`;
	});
	const [moved] = texts.splice(fromIndex, 1);
	texts.splice(toIndex, 0, moved!);
	return preamble + texts.join('');
}

/** Ganti judul blok `index` (heading line-nya saja; isi bab tetap). */
export function renameSection(source: string, index: number, title: string): string {
	const blocks = listHeadingBlocks(source);
	const block = blocks[index];
	if (!block) return source;
	const nl = source.indexOf('\n', block.from);
	const lineEnd = nl === -1 ? source.length : nl;
	return source.slice(0, block.from) + `= ${title}` + source.slice(lineEnd);
}

/** Hapus seluruh blok `index` (heading + isinya). */
export function removeSection(source: string, index: number): string {
	const blocks = listHeadingBlocks(source);
	const block = blocks[index];
	if (!block) return source;
	return source.slice(0, block.from) + source.slice(block.to);
}
