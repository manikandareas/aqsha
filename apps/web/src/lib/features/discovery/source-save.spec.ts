import { describe, expect, it } from 'vitest';
import { paperToCitationInput } from './source-save';

describe('paperToCitationInput', () => {
	it('DOI menang — resolusi metadata kanonik di server', () => {
		expect(
			paperToCitationInput({ title: 'X', doi: '10.1234/abc', authors: ['A'], year: 2024 })
		).toEqual({ doi: '10.1234/abc' });
	});

	it('tanpa DOI → fields manual dari metadata hasil pencarian', () => {
		expect(
			paperToCitationInput({
				title: 'Judul Paper',
				url: 'https://example.org/p',
				authors: ['Ada Lovelace', 'Alan Turing'],
				year: 2023,
				venue: 'Jurnal Contoh'
			})
		).toEqual({
			fields: {
				title: 'Judul Paper',
				authors: [{ literal: 'Ada Lovelace' }, { literal: 'Alan Turing' }],
				publishedYear: 2023,
				venue: 'Jurnal Contoh',
				url: 'https://example.org/p'
			}
		});
	});

	it('field kosong tidak ikut terkirim', () => {
		expect(paperToCitationInput({ title: 'Minimal' })).toEqual({
			fields: { title: 'Minimal' }
		});
	});
});
