import { describe, expect, it } from 'vitest';
import { hasPendingIngest, ingestBadge } from './library-ingest-view';

describe('ingest badge', () => {
	it('item selesai dengan teks penuh tidak menampilkan badge', () => {
		expect(ingestBadge({ ingestStatus: 'ready', textCoverage: 'full_text' })).toBeNull();
	});

	it('item selesai tanpa PDF menyatakan cakupan abstrak', () => {
		expect(ingestBadge({ ingestStatus: 'ready', textCoverage: 'abstract' })).toEqual({
			label: 'Abstrak saja',
			tone: 'muted'
		});
	});

	it('item yang sedang diproses memakai nada progress', () => {
		expect(ingestBadge({ ingestStatus: 'processing', textCoverage: 'none' })?.tone).toBe(
			'progress'
		);
	});

	it('item gagal memakai nada danger', () => {
		expect(ingestBadge({ ingestStatus: 'failed', textCoverage: 'none' })).toEqual({
			label: 'Gagal diproses',
			tone: 'danger'
		});
	});
});

describe('polling gate', () => {
	it('berhenti saat semua item selesai', () => {
		expect(hasPendingIngest([{ ingestStatus: 'ready' }, { ingestStatus: 'failed' }])).toBe(false);
	});

	it('lanjut selama masih ada yang antre', () => {
		expect(hasPendingIngest([{ ingestStatus: 'ready' }, { ingestStatus: 'pending' }])).toBe(true);
	});
});
