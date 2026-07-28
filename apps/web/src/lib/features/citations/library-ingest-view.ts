import type { CitationIngestStatus, CitationTextCoverage } from './types';

export type IngestBadge = { label: string; tone: 'muted' | 'progress' | 'danger' };

/**
 * Item yang beres dengan teks penuh adalah keadaan normal, jadi ia tidak diberi
 * penanda apa pun — badge hanya untuk hal yang perlu diketahui pengguna.
 */
export function ingestBadge(item: {
	ingestStatus: CitationIngestStatus;
	textCoverage: CitationTextCoverage;
}): IngestBadge | null {
	if (item.ingestStatus === 'failed') return { label: 'Gagal diproses', tone: 'danger' };
	if (item.ingestStatus === 'pending' || item.ingestStatus === 'processing') {
		return { label: 'Diproses…', tone: 'progress' };
	}
	if (item.textCoverage === 'full_text') return null;
	if (item.textCoverage === 'abstract') return { label: 'Abstrak saja', tone: 'muted' };
	return { label: 'Belum terindeks', tone: 'muted' };
}

/** Polling hanya hidup selama masih ada pekerjaan; kalau tidak, ia berhenti sendiri. */
export function hasPendingIngest(items: Array<{ ingestStatus: CitationIngestStatus }>): boolean {
	return items.some((i) => i.ingestStatus === 'pending' || i.ingestStatus === 'processing');
}
