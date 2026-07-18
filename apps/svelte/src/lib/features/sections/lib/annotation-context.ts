import type { AnnotationView } from '../api';

/**
 * Serialisasi antrian anotasi → satu context message untuk Astra. Berisi data mentah
 * (id + teks + baris + catatan) — alur kerja tool ada di instruksi agen, bukan di sini.
 */
export function buildAnnotationClientContext(input: {
	sectionId: string;
	sectionTitle: string;
	annotations: AnnotationView[];
}): string {
	const lines = input.annotations.map((a, i) => {
		const loc = a.sourceLine != null ? `, baris ${a.sourceLine}` : '';
		const excerpt = a.selectedText ? ` — teks: "${a.selectedText}"` : '';
		const note = a.note ? ` — catatan: ${a.note}` : '';
		return `${i + 1}. [id:${a.id}] (${a.kind}, hal. ${a.page}${loc})${excerpt}${note}`;
	});
	return [
		`Anotasi bab "${input.sectionTitle}" (sectionId: ${input.sectionId}) dari user:`,
		...lines
	].join('\n');
}
