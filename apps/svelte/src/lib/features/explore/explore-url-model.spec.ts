import { describe, expect, it } from 'vitest';
import {
	applyExploreUrl,
	parseTopicParam,
	readExploreUrl,
	serializeExploreUrl,
	TOPIC_VALUES
} from './explore-url-model';

// Explore URL codec contract. Default `q` ("") and `null` topic OMIT their param; an invalid topic →
// null; other params preserved; round-trip stable. Drives Back/Forward/refresh correctness.

describe('parseTopicParam', () => {
	it('accepts only the known literals', () => {
		for (const t of TOPIC_VALUES) expect(parseTopicParam(t)).toBe(t);
	});
	it('rejects garbage / empty / null → null', () => {
		expect(parseTopicParam('nope')).toBeNull();
		expect(parseTopicParam('')).toBeNull();
		expect(parseTopicParam(null)).toBeNull();
		expect(parseTopicParam(undefined)).toBeNull();
	});
});

describe('readExploreUrl', () => {
	it('defaults q to "" and topic to null on an empty URL', () => {
		expect(readExploreUrl(new URLSearchParams())).toEqual({
			q: '',
			sort: 'relevance',
			filters: [],
			topic: null
		});
	});
	it('reads present values, dropping an invalid topic', () => {
		expect(readExploreUrl(new URLSearchParams('q=agents&topic=kesehatan'))).toEqual({
			q: 'agents',
			sort: 'relevance',
			filters: [],
			topic: 'kesehatan'
		});
		expect(readExploreUrl(new URLSearchParams('q=agents&topic=bogus'))).toEqual({
			q: 'agents',
			sort: 'relevance',
			filters: [],
			topic: null
		});
	});
});

describe('applyExploreUrl / serializeExploreUrl', () => {
	it('omits default q ("") and null topic', () => {
		expect(serializeExploreUrl({ q: '', topic: null })).toBe('');
		expect(serializeExploreUrl({ q: 'world models', topic: null })).toBe('q=world+models');
		expect(serializeExploreUrl({ q: '', topic: 'lingkungan' })).toBe('topic=lingkungan');
		expect(serializeExploreUrl({ q: 'agents', topic: 'sains_teknologi' })).toBe(
			'q=agents&topic=sains_teknologi'
		);
	});

	it('trims q on write (the ask-bar submits trimmed)', () => {
		expect(serializeExploreUrl({ q: '  hi  ' })).toBe('q=hi');
		expect(serializeExploreUrl({ q: '   ' })).toBe('');
	});

	it('patches a single key, preserving other params', () => {
		const base = new URLSearchParams('panel=m&q=old');
		const next = applyExploreUrl(base, { topic: 'pendidikan' });
		expect(next.get('panel')).toBe('m');
		expect(next.get('q')).toBe('old');
		expect(next.get('topic')).toBe('pendidikan');
		// base is untouched (pure).
		expect(base.has('topic')).toBe(false);
	});

	it('clearing a key deletes it', () => {
		const base = new URLSearchParams('q=x&topic=kesehatan');
		expect(applyExploreUrl(base, { q: '' }).has('q')).toBe(false);
		expect(applyExploreUrl(base, { topic: null }).has('topic')).toBe(false);
	});

	it('round-trips read∘apply', () => {
		const s = serializeExploreUrl({ q: 'deep learning', topic: 'sosial_ekonomi' });
		expect(readExploreUrl(new URLSearchParams(s))).toEqual({
			q: 'deep learning',
			sort: 'relevance',
			filters: [],
			topic: 'sosial_ekonomi'
		});
	});

	it('round-trip q, sort, filter state versioned, dan topic legacy', () => {
		const next = applyExploreUrl(new URLSearchParams('topic=kesehatan'), {
			q: ' climate adaptation ',
			sort: 'citations_desc',
			filters: [{ id: 'citation_count', value: { min: 50 } }]
		});
		expect(next.get('q')).toBe('climate adaptation');
		expect(next.get('sort')).toBe('citations_desc');
		expect(next.get('f')).toMatch(/^eyJ2IjoxLCJjbGF1c2VzIjpb/);
		expect(readExploreUrl(next)).toMatchObject({
			q: 'climate adaptation',
			topic: 'kesehatan',
			sort: 'citations_desc'
		});
	});
});
