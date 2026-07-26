import { parseDocumentOutline } from '$lib/features/document/lib/outline';

export type QuickAction = { label: string; prompt: string };

const CITE_RE = /(^|[^\w@])@([A-Za-z0-9][\w:.-]*)/g;
const BIB_KEY_RE = /@\w+\s*\{\s*([^,\s}]+)/g;

/** Key yang benar-benar ada di bib proyek. */
function bibKeys(bib: string): Set<string> {
	const keys = new Set<string>();
	for (const m of bib.matchAll(BIB_KEY_RE)) keys.add(m[1]!);
	return keys;
}

/** Sitasi `@key` di sumber yang tak punya entri bib. */
function orphanCiteKeys(source: string, bib: string): string[] {
	const known = bibKeys(bib);
	const orphans: string[] = [];
	for (const m of source.matchAll(CITE_RE)) {
		const key = m[2]!.replace(/[.\-:]+$/, '');
		if (key && !known.has(key) && !orphans.includes(key)) orphans.push(key);
	}
	return orphans;
}

function wordsAfter(lines: string[], startLine: number, endLine: number): number {
	let words = 0;
	for (let ln = startLine + 1; ln <= endLine; ln += 1) {
		const text = lines[ln - 1]?.trim() ?? '';
		if (text === '' || text.startsWith('=')) continue;
		words += text.split(/\s+/).length;
	}
	return words;
}

/**
 * Saran pembuka yang dihitung dari keadaan dokumen nyata — memperkenalkan kemampuan Astra tanpa
 * menambah chrome permanen. Urutannya sengaja: kekosongan struktural lebih mendesak daripada
 * pemolesan, dan anotasi terbuka adalah permintaan user yang belum terjawab.
 */
export function projectQuickActions(input: {
	source: string;
	bib: string;
	annotations: readonly { status: string }[];
}): QuickAction[] {
	const actions: QuickAction[] = [];
	const outline = parseDocumentOutline(input.source);
	const lines = input.source.split('\n');

	if (outline.length === 0) {
		actions.push({
			label: 'Susun kerangka bab',
			prompt: 'Susun kerangka bab untuk proyek ini beserta urutan yang lazim.'
		});
	} else {
		const chapters = outline.map((entry, i) => ({
			title: entry.title,
			words: wordsAfter(
				lines,
				entry.sourceLine,
				outline[i + 1] ? outline[i + 1]!.sourceLine - 1 : lines.length
			)
		}));
		const empty = chapters.find((c) => c.words === 0);
		if (empty) {
			actions.push({
				label: `Lanjutkan bab ${empty.title} — masih kosong`,
				prompt: `Tulis isi bab ${empty.title} sesuai konteks proyek ini.`
			});
		}
		// "Bab paling tipis" hanya bermakna saat ada bab lain untuk dibandingkan; dengan satu bab
		// terisi, saran ini akan muncul selamanya betapapun matang dokumennya.
		const written = chapters.filter((c) => c.words > 0).sort((a, b) => a.words - b.words);
		const thinnest = written.length > 1 ? written[0] : undefined;
		if (thinnest) {
			actions.push({
				label: `Rapikan bab ${thinnest.title} · ${thinnest.words} kata`,
				prompt: `Rapikan dan perdalam bab ${thinnest.title}.`
			});
		}
	}

	const orphans = orphanCiteKeys(input.source, input.bib);
	if (orphans.length > 0) {
		actions.push({
			label: `Periksa ${orphans.length} sitasi yatim`,
			prompt: 'Periksa sitasi yang belum punya entri referensi, lalu tambahkan sumbernya.'
		});
	}

	const open = input.annotations.filter((a) => a.status === 'open' || a.status === 'sent').length;
	if (open > 0) {
		actions.push({
			label: `Jawab ${open} anotasi terbuka`,
			prompt: 'Kerjakan anotasi yang masih terbuka di dokumen ini.'
		});
	}

	return actions.slice(0, 4);
}
