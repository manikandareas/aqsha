import { describe, expect, it } from 'vitest';
import { applyLibraryUrl, readLibraryUrl } from './library-url-model';

describe('library-url-model', () => {
	it('membaca default kosong', () => {
		expect(readLibraryUrl(new URLSearchParams())).toEqual({
			q: '',
			status: null,
			source: null,
			tag: null,
			cite: null
		});
	});

	it('menolak nilai enum liar', () => {
		const params = new URLSearchParams('status=weird&source=doi');
		const state = readLibraryUrl(params);
		expect(state.status).toBeNull();
		expect(state.source).toBe('doi');
	});

	it('apply men-set dan menghapus param', () => {
		const params = new URLSearchParams('q=llm&cite=abc');
		const next = applyLibraryUrl(params, { q: '', cite: 'xyz', tag: 'ai' });
		expect(next.get('q')).toBeNull();
		expect(next.get('cite')).toBe('xyz');
		expect(next.get('tag')).toBe('ai');
	});
});
