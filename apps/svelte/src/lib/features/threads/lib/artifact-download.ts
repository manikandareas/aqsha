/**
 * Browser-safe download triggers — Svelte port of the download half of
 * `apps/web/lib/artifact-download.ts`. Phase 7 (THX-4) needed the two *trigger* functions
 * (thread reference export = BibTeX/RIS blob; analysis export = base64 docx/xlsx); Phase 9
 * (WSP artifact reader) adds `resolveArtifactDownload` (synthesize a savable representation of
 * any artifact type).
 *
 * The byte payload + `fileName` are produced authoritatively by the server; these helpers must
 * reproduce EXACTLY the same anchor-download bytes as web (§11.2 contract). Kept as a pure DOM
 * module (no runes, no `@aqsha/db`/services) so it is browser-only and unit-testable.
 */

import type { ArtifactRenderPayload } from '$lib/features/artifacts/types';

/**
 * A downloadable representation of an artifact. File-backed artifacts (pdf/docx/image) stream
 * straight from object storage through an anchor `download`; every other type is synthesized
 * client-side into a Blob with the right extension + mime so the reader can always save exactly
 * what they're looking at.
 */
export type ArtifactDownload =
	| { kind: 'url'; href: string; fileName: string }
	| { kind: 'blob'; mime: string; fileName: string; getText: () => string };

type SourceArtifactType = 'plain_text' | 'html' | 'svg' | 'mermaid' | 'json' | 'csv' | 'code';

const SOURCE_DOWNLOAD_SPEC: Record<SourceArtifactType, { mime: string; ext: string }> = {
	plain_text: { mime: 'text/plain', ext: 'txt' },
	html: { mime: 'text/html', ext: 'html' },
	svg: { mime: 'image/svg+xml', ext: 'svg' },
	mermaid: { mime: 'text/plain', ext: 'mmd' },
	json: { mime: 'application/json', ext: 'json' },
	csv: { mime: 'text/csv', ext: 'csv' },
	code: { mime: 'text/plain', ext: 'txt' }
};

const CODE_EXTENSIONS: Record<string, string> = {
	javascript: 'js',
	js: 'js',
	typescript: 'ts',
	ts: 'ts',
	tsx: 'tsx',
	jsx: 'jsx',
	python: 'py',
	py: 'py',
	ruby: 'rb',
	go: 'go',
	rust: 'rs',
	java: 'java',
	kotlin: 'kt',
	swift: 'swift',
	php: 'php',
	c: 'c',
	cpp: 'cpp',
	'c++': 'cpp',
	csharp: 'cs',
	cs: 'cs',
	sql: 'sql',
	bash: 'sh',
	sh: 'sh',
	shell: 'sh',
	yaml: 'yaml',
	yml: 'yml',
	toml: 'toml',
	css: 'css',
	xml: 'xml',
	markdown: 'md',
	md: 'md'
};

/** A filesystem-safe stem derived from the artifact title (never empty). */
function slugifyTitle(title: string): string {
	const slug = title
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
	return slug || 'artifact';
}

function codeExtension(language: string | undefined): string {
	if (!language) return 'txt';
	return CODE_EXTENSIONS[language.toLowerCase()] ?? 'txt';
}

export function resolveArtifactDownload(
	payload: ArtifactRenderPayload,
	title: string
): ArtifactDownload {
	const slug = slugifyTitle(title);

	// Source-bearing types: plain_text | html | svg | mermaid | json | csv | code.
	// The `"source" in payload` presence check narrows this union cleanly.
	if ('source' in payload) {
		const spec = SOURCE_DOWNLOAD_SPEC[payload.artifactType];
		const ext = payload.artifactType === 'code' ? codeExtension(payload.language) : spec.ext;
		return {
			kind: 'blob',
			mime: spec.mime,
			fileName: `${slug}.${ext}`,
			getText: () => payload.source
		};
	}

	if (payload.artifactType === 'markdown') {
		return {
			kind: 'blob',
			mime: 'text/markdown',
			fileName: `${slug}.md`,
			getText: () => payload.markdown
		};
	}

	if (payload.artifactType === 'url') {
		return {
			kind: 'blob',
			mime: 'text/plain',
			fileName: `${slug}.txt`,
			getText: () => payload.readableText
		};
	}

	// Remaining file-backed types: pdf | docx | image — stream straight from object storage.
	return { kind: 'url', href: payload.url, fileName: payload.fileName };
}

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
