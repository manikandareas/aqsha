import { describe, expect, it } from 'vitest';
import {
	applyExploreUrl,
	parseTopicParam,
	readExploreUrl,
	serializeExploreUrl,
	TOPIC_VALUES
} from './explore-url-model';

// Explore URL codec contract (§11.2 / EXP-1 ★ "URL state byte-equivalent"). Parity target = the web
// nuqs setup: default `q` ("") and `null` topic OMIT their param; an invalid topic → null; other params
// preserved; round-trip stable. Drives Back/Forward/refresh correctness.

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
		expect(readExploreUrl(new URLSearchParams())).toEqual({ q: '', topic: null });
	});
	it('reads present values, dropping an invalid topic', () => {
		expect(readExploreUrl(new URLSearchParams('q=agents&topic=kesehatan'))).toEqual({
			q: 'agents',
			topic: 'kesehatan'
		});
		expect(readExploreUrl(new URLSearchParams('q=agents&topic=bogus'))).toEqual({
			q: 'agents',
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
			topic: 'sosial_ekonomi'
		});
	});
});
