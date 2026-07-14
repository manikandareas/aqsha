/**
 * Browser-safe download triggers — Svelte port of the download half of
 * `apps/web/lib/artifact-download.ts`. Phase 7 (THX-4) only needs the two *trigger*
 * functions (thread reference export = BibTeX/RIS blob; analysis export = base64 docx/xlsx);
 * `resolveArtifactDownload` (artifact reader) belongs to Phase 9.
 *
 * The byte payload + `fileName` are produced authoritatively by the server; these helpers must
 * reproduce EXACTLY the same anchor-download bytes as web (§11.2 contract). Kept as a pure DOM
 * module (no runes, no `@aqsha/db`/services) so it is browser-only and unit-testable.
 */

/** Click a Blob through a transient anchor (shared by text + binary downloaders). */
function triggerBlobDownload(blob: Blob, fileName: string): void {
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = objectUrl;
	anchor.download = fileName;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(objectUrl);
}

/** Synthesize a text-backed Blob download (BibTeX/RIS) and click it through a transient anchor. */
export function triggerArtifactDownload(download: {
	mime: string;
	fileName: string;
	getText: () => string;
}): void {
	triggerBlobDownload(new Blob([download.getText()], { type: download.mime }), download.fileName);
}

/**
 * Download binary content delivered as base64 (server-built docx/xlsx) — decode to bytes, wrap in a
 * typed Blob, click through the same transient anchor. Binary can't ride the text path.
 */
export function triggerBase64Download(args: {
	mime: string;
	fileName: string;
	base64: string;
}): void {
	const binary = atob(args.base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	triggerBlobDownload(new Blob([bytes], { type: args.mime }), args.fileName);
}

/** Decode a base64 string to bytes (extracted for a byte-equivalence contract test). */
export function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
