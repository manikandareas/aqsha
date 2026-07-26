import { describe, expect, it } from 'vitest';
import { projectQuickActions } from './project-quick-actions';

const SOURCE = [
	'= Pendahuluan',
	'',
	'Menurut @smith2020 dan @hantu2021 hasilnya berbeda sekali sungguh.',
	'',
	'= Metode Penelitian',
	'',
	'= Hasil',
	'',
	'Ada isi.'
].join('\n');

const BIB = '@article{smith2020, title={A}}';

describe('projectQuickActions', () => {
	it('menawarkan melanjutkan bab kosong pertama', () => {
		const actions = projectQuickActions({ source: SOURCE, bib: BIB, annotations: [] });
		expect(actions[0]?.label).toBe('Lanjutkan bab Metode Penelitian — masih kosong');
		expect(actions[0]?.prompt).toContain('Metode Penelitian');
	});

	it('menawarkan memperbaiki sitasi yatim', () => {
		const actions = projectQuickActions({ source: SOURCE, bib: BIB, annotations: [] });
		expect(actions.some((a) => a.label === 'Periksa 1 sitasi yatim')).toBe(true);
	});

	it('menawarkan menjawab anotasi terbuka', () => {
		const actions = projectQuickActions({
			source: SOURCE,
			bib: BIB,
			annotations: [{ status: 'open' }, { status: 'sent' }, { status: 'resolved' }]
		});
		expect(actions.some((a) => a.label === 'Jawab 2 anotasi terbuka')).toBe(true);
	});

	it('menawarkan menyusun kerangka saat dokumen kosong', () => {
		const actions = projectQuickActions({ source: '', bib: '', annotations: [] });
		expect(actions[0]?.label).toBe('Susun kerangka bab');
	});

	it('tak pernah mengembalikan lebih dari empat aksi', () => {
		const actions = projectQuickActions({
			source: SOURCE,
			bib: BIB,
			annotations: [{ status: 'open' }]
		});
		expect(actions.length).toBeLessThanOrEqual(4);
	});

	it('mengembalikan daftar kosong saat tak ada yang perlu dikerjakan', () => {
		expect(
			projectQuickActions({ source: '= Bab\n\nIsi lengkap.', bib: '', annotations: [] })
		).toEqual([]);
	});
});
