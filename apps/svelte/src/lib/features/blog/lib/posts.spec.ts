import { describe, expect, it } from 'vitest';
import { getPublishedPost, publishedPosts } from './posts';
import { getPublishedEntry, publishedEntries } from '$lib/features/changelog/lib/entries';

// Contract terhadap data Content Collections (generated saat `content-collections build`, prefiks
// script test). Menjaga schema/slug/ordering/non-draft — kontrak §8.2.
describe('publishedPosts', () => {
	it('non-draft, terbaru dulu, dengan computed fields', () => {
		const posts = publishedPosts();
		expect(posts.length).toBeGreaterThanOrEqual(1);
		expect(posts.every((p) => !p.draft)).toBe(true);
		// Sorted desc by publishedAt (string ISO localeCompare)
		for (let i = 1; i < posts.length; i++) {
			expect(posts[i - 1].publishedAt >= posts[i].publishedAt).toBe(true);
		}
		const first = posts[0];
		expect(first.url).toBe(`/blog/${first.slug}`);
		expect(typeof first.mdx).toBe('string');
		expect(first.mdx).toContain('<'); // HTML dari compileMarkdown
		expect(first.readingTime).toBeGreaterThanOrEqual(1);
		expect(typeof first.excerpt).toBe('string');
	});

	it('getPublishedPost: lookup by slug, undefined untuk slug tak ada', () => {
		const slug = publishedPosts()[0].slug;
		expect(getPublishedPost(slug)?.slug).toBe(slug);
		expect(getPublishedPost('slug-tidak-ada')).toBeUndefined();
	});
});

describe('publishedEntries', () => {
	it('non-draft, terbaru dulu, url per slug', () => {
		const entries = publishedEntries();
		expect(entries.length).toBeGreaterThanOrEqual(1);
		expect(entries.every((e) => !e.draft)).toBe(true);
		for (let i = 1; i < entries.length; i++) {
			expect(entries[i - 1].publishedAt >= entries[i].publishedAt).toBe(true);
		}
		expect(entries[0].url).toBe(`/changelog/${entries[0].slug}`);
	});

	it('getPublishedEntry: lookup + undefined', () => {
		const slug = publishedEntries()[0].slug;
		expect(getPublishedEntry(slug)?.slug).toBe(slug);
		expect(getPublishedEntry('nope')).toBeUndefined();
	});
});
