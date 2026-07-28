import { describe, expect, it } from 'vitest';
import { extractDoiFromText } from './clipboard-doi';

describe('extractDoiFromText', () => {
	it('mengambil DOI telanjang', () => {
		expect(extractDoiFromText('10.1016/j.jclepro.2021.127593')).toBe(
			'10.1016/j.jclepro.2021.127593'
		);
	});

	it('mengambil DOI dari URL doi.org', () => {
		expect(extractDoiFromText('https://doi.org/10.1234/abc.def')).toBe('10.1234/abc.def');
	});

	it('mengabaikan teks tanpa DOI', () => {
		expect(extractDoiFromText('catatan rapat minggu depan')).toBeNull();
	});

	it('mengabaikan teks kosong', () => {
		expect(extractDoiFromText('   ')).toBeNull();
	});
});
