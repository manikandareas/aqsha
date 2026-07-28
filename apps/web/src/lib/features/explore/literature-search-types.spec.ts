import { describe, expect, it } from 'vitest';
import { literaturePaperToSearchInput, type LiteraturePaper } from './literature-search-types';

const PAPER: LiteraturePaper = {
	key: 'doi:10.1/a',
	title: 'Judul',
	snippet: 'Cuplikan',
	doi: '10.1/a',
	url: 'https://e.org/a',
	pdfUrl: null,
	hasPdf: false,
	authors: ['A', 'B'],
	year: 2024,
	publicationDate: '2024-01-01',
	venue: 'Jurnal',
	citedByCount: 3,
	isOpenAccess: true,
	oaStatus: 'gold',
	workType: 'article',
	language: 'id',
	isRetracted: false,
	topics: ['t']
};

describe('literaturePaperToSearchInput', () => {
	it('memetakan paper ke input simpan tanpa adapter perantara', () => {
		expect(literaturePaperToSearchInput(PAPER)).toEqual({
			clientKey: 'doi:10.1/a',
			title: 'Judul',
			doi: '10.1/a',
			url: 'https://e.org/a',
			authors: ['A', 'B'],
			year: 2024,
			venue: 'Jurnal'
		});
	});
});
