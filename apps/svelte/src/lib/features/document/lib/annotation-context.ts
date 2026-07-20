import type { AnnotationView } from '../api';

/**
 * Serialisasi antrian anotasi → satu context message untuk Astra. Anchor edit = teks terseleksi
 * (typst.ts tak mengekspos peta span→baris); alur kerja tool ada di instruksi agen, bukan di sini.
 */
export function buildAnnotationClientContext(input: { annotations: AnnotationView[] }): string {
	const lines = input.annotations.map((a, i) => {
		const excerpt = a.selectedText ? ` — teks: "${a.selectedText}"` : '';
		const note = a.note ? ` — catatan: ${a.note}` : '';
		return `${i + 1}. [id:${a.id}] (hal. ${a.page})${excerpt}${note}`;
	});
	return [
		'Anotasi dari user pada dokumen proyek ini. Panggil get_document_source lalu propose_document_edit; pakai teks terseleksi sebagai anchor (edits.oldText).',
		...lines
	].join('\n');
}
