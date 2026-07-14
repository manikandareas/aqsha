import { describe, expect, it } from 'vitest';
import { splitTokenLabel, tokenPillClass } from './token-pill';
import { originMeta, sourceDomain, sourceHref, faviconUrl } from './source-card';

// Contract tests for the composer/source presentation models (THC-8).

describe('splitTokenLabel', () => {
	it('splits the known prefix glyphs', () => {
		expect(splitTokenLabel('/matriks')).toEqual({ prefix: '/', text: 'matriks' });
		expect(splitTokenLabel('@Skripsi')).toEqual({ prefix: '@', text: 'Skripsi' });
		expect(splitTokenLabel('❝ 3 blok')).toEqual({ prefix: '❝', text: ' 3 blok' });
	});
	it('leaves an unprefixed label untouched', () => {
		expect(splitTokenLabel('plain')).toEqual({ prefix: '', text: 'plain' });
	});
});

describe('tokenPillClass', () => {
	it('produces distinct tone classes per surface + kind', () => {
		expect(tokenPillClass('composer', 'command')).toContain('bg-lavender-soft');
		expect(tokenPillClass('composer', 'mention')).toContain('bg-mint-soft');
		expect(tokenPillClass('bubble', 'command')).toContain('bg-lavender/25');
		expect(tokenPillClass('bubble', 'mention')).toContain('bg-mint/25');
	});
	it('always includes the shared pill shape', () => {
		expect(tokenPillClass('composer', 'command')).toContain('inline-flex');
	});
});

describe('source-card helpers', () => {
	it('originMeta maps class → glyph + label', () => {
		expect(originMeta('arxiv').label).toBe('arXiv');
		expect(originMeta('doi').label).toBe('Makalah');
		expect(originMeta('web').label).toBe('Web');
		expect(originMeta('arxiv').icon).toBeDefined();
	});
	it('sourceHref prefers url, falls back to doi.org', () => {
		expect(sourceHref({ url: 'https://x.com', doi: null })).toBe('https://x.com');
		expect(sourceHref({ url: null, doi: '10.1/x' })).toBe('https://doi.org/10.1/x');
		expect(sourceHref({ url: null, doi: null })).toBeNull();
	});
	it('sourceDomain strips www and handles invalid urls', () => {
		expect(sourceDomain({ url: 'https://www.nature.com/a', doi: null })).toBe('nature.com');
		expect(sourceDomain({ url: 'not a url', doi: null })).toBeNull();
	});
	it('faviconUrl builds a google s2 url or null', () => {
		expect(faviconUrl('nature.com')).toContain('favicons?domain=nature.com');
		expect(faviconUrl(null)).toBeNull();
	});
});
