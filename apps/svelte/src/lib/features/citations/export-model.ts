// Ekstraksi konten export sitasi dari respons Eden Treaty (bibtex/ris/csl-json).
//
// Eden mem-parse body secara otomatis berdasarkan content-type route:
//  - bibtex (`application/x-bibtex`) & ris (`application/x-research-info-systems`)
//    → tidak dikenali sebagai JSON → dikembalikan sebagai string mentah.
//  - csl-json (`application/json`) → di-parse balik menjadi array/objek JS.
// Handler unduh lama hanya menangani `string | Response`, sehingga bentuk ketiga
// (hasil auto-parse csl-json) jatuh ke cabang `Response.text()` dan melempar
// `TypeError` (Array tak punya `.text`) — export csl-json gagal padahal HTTP 200.
// Logika ini diekstrak murni supaya ketiga bentuk teruji tanpa merender hook.

export type CitationExportFormat = 'bibtex' | 'ris' | 'csl-json';

/**
 * Kembalikan payload export sebagai teks, apa pun bentuk yang diberikan Eden:
 * string mentah (bibtex/ris), `Response` mentah, atau array/objek hasil auto-parse
 * (csl-json). Untuk csl-json, `JSON.stringify` mengembalikannya ke teks yang identik
 * dengan payload server.
 */
export async function resolveExportContent(data: unknown): Promise<string> {
	if (typeof data === 'string') return data;
	if (data instanceof Response) return await data.text();
	return JSON.stringify(data, null, 2);
}

export function exportFileExtension(format: CitationExportFormat): string {
	return format === 'bibtex' ? 'bib' : format === 'ris' ? 'ris' : 'json';
}

export function exportFileName(format: CitationExportFormat): string {
	return `sitasi.${exportFileExtension(format)}`;
}

/** Mime blob unduhan — `.json` diberi `application/json` agar semantiknya tepat. */
export function exportBlobType(format: CitationExportFormat): string {
	return format === 'csl-json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8';
}
