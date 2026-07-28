// Tipe lokal artifact untuk komponen (struktural — cocok dengan shape Eden dari
// api). Sengaja TIDAK import @aqsha/services/@aqsha/db agar drizzle tak masuk
// bundle client.

export type Artifact = {
	_id: string;
	workspaceId: string | null;
	folderId: string | null;
	artifactType: string;
	artifactFamily: string;
	source: string;
	title: string;
	language: string | null;
	mimeType: string | null;
	fileName: string | null;
	byteSize: number | null;
	indexingStatus: string;
	indexingFailureReason: string | null;
	detectedDocumentKind: string | null;
	plainTextPreview: string | null;
	status: string | null;
	createdAt: number;
	updatedAt: number;
};

export type ArtifactRenderPayload =
	| { artifactType: 'markdown'; blocksJson: string; markdown: string; plainText: string }
	| {
			artifactType: 'pdf' | 'docx' | 'image';
			fileName: string;
			mimeType: string;
			byteSize: number;
			url: string;
			indexingStatus: string;
			indexingFailureReason?: string;
	  }
	| {
			artifactType: 'url';
			originalUrl: string;
			normalizedUrl: string;
			status: string;
			title?: string;
			description?: string;
			siteName?: string;
			failureReason?: string;
			readableText: string;
	  }
	| {
			artifactType: 'plain_text' | 'html' | 'svg' | 'mermaid' | 'json' | 'csv' | 'code';
			source: string;
			language?: string;
	  };

const TYPE_LABELS: Record<string, string> = {
	markdown: 'Dokumen',
	plain_text: 'Teks',
	pdf: 'PDF',
	docx: 'Word',
	image: 'Gambar',
	url: 'Tautan',
	html: 'HTML',
	svg: 'SVG',
	mermaid: 'Diagram',
	json: 'JSON',
	csv: 'CSV',
	spreadsheet: 'Excel',
	code: 'Kode'
};

export const artifactTypeLabel = (t: string): string => TYPE_LABELS[t] ?? t;

// Client-boundary copy of upload accept rules — browser must not import `@aqsha/services`.
// Used as the `accept` attribute on upload inputs.
export const UPLOAD_ACCEPT = [
	'.pdf',
	'.docx',
	'.txt',
	'.md',
	'.markdown',
	'.csv',
	'.xlsx',
	'.json',
	'.png',
	'.jpg',
	'.jpeg',
	'.webp',
	'application/pdf',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'text/plain',
	'text/markdown',
	'text/csv',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/json',
	'image/png',
	'image/jpeg',
	'image/webp'
].join(',');
