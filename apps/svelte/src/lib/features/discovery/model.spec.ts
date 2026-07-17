import { describe, expect, it } from 'vitest';
import {
	discoveryItemKey,
	feedDetailHref,
	feedItemToDiscoveryItem,
	paperToDiscoveryItem,
	type DiscoveryItem
} from './model';
import type { ExplorePaper, FeedItem } from './types';

// Feed fixture → DiscoveryItem mapping contract. Field-for-field stability keeps cards + save/hide handles consistent.

const paperFeed: FeedItem = {
	_id: 'f1',
	kind: 'paper',
	title: 'Emergent tool use',
	summary: 'agents learn tools',
	url: 'https://arxiv.org/abs/2401.001',
	provider: 'arxiv',
	sourceLabel: 'arXiv',
	paperKey: 'arxiv:2401.001',
	doi: '10.1/abc',
	pdfUrl: 'https://arxiv.org/pdf/2401.001',
	topics: ['agents']
};

// No paperKey → exercises the feedDetailHref external (non-internal-reader) case below.
const bareFeed: FeedItem = {
	_id: 'f2',
	kind: 'paper',
	title: 'A paper without a DOI',
	summary: 'a summary',
	url: 'https://arxiv.org/abs/2401.002?utm=1',
	resolvedUrl: 'https://arxiv.org/abs/2401.002',
	provider: 'arxiv',
	sourceLabel: 'arXiv',
	topics: []
};

const searchPaper: Omit<ExplorePaper, 'lastSeenAt'> = {
	key: 'doi:10.2/z',
	title: 'World models',
	snippet: 'a snippet',
	abstract: 'the abstract',
	url: 'https://openalex.org/W1',
	pdfUrl: 'https://cdn/p.pdf',
	doi: '10.2/z',
	provider: 'openalex',
	sourceLabel: 'OpenAlex',
	authors: ['Ada Lovelace', 'Alan Turing'],
	year: 2024,
	venue: 'NeurIPS',
	citedByCount: 12,
	isOpenAccess: true,
	topics: ['world']
};

describe('feedItemToDiscoveryItem', () => {
	it('carries a feed itemRef and keeps every field', () => {
		const d = feedItemToDiscoveryItem(paperFeed);
		expect(d.itemRef).toEqual({ kind: 'feed', feedItemId: 'f1' });
		expect(d.title).toBe('Emergent tool use');
		expect(d.pdfUrl).toBe('https://arxiv.org/pdf/2401.001');
	});
});

describe('paperToDiscoveryItem', () => {
	it('produces the exact DiscoveryItem shape (byte-for-byte with web)', () => {
		expect(paperToDiscoveryItem(searchPaper)).toEqual({
			_id: 'paper:doi:10.2/z',
			kind: 'paper',
			title: 'World models',
			summary: 'a snippet',
			tldr: 'the abstract',
			url: 'https://openalex.org/W1',
			resolvedUrl: 'https://openalex.org/W1',
			imageUrl: undefined,
			provider: 'openalex',
			sourceLabel: 'OpenAlex',
			paperKey: 'doi:10.2/z',
			doi: '10.2/z',
			pdfUrl: 'https://cdn/p.pdf',
			authors: ['Ada Lovelace', 'Alan Turing'],
			year: 2024,
			venue: 'NeurIPS',
			citedByCount: 12,
			isOpenAccess: true,
			topics: ['world'],
			itemRef: { kind: 'paper', paperKey: 'doi:10.2/z' }
		});
	});

	it('falls back tldr → snippet when no abstract', () => {
		const d = paperToDiscoveryItem({ ...searchPaper, abstract: undefined });
		expect(d.tldr).toBe('a snippet');
	});
});

describe('discoveryItemKey', () => {
	it('prefixes by ref kind', () => {
		expect(discoveryItemKey(feedItemToDiscoveryItem(paperFeed))).toBe('feed:f1');
		expect(discoveryItemKey(paperToDiscoveryItem(searchPaper))).toBe('paper:doi:10.2/z');
	});
});

describe('feedDetailHref', () => {
	it('routes paper by encoded key, else null when there is no key', () => {
		expect(feedDetailHref(feedItemToDiscoveryItem(paperFeed))).toBe(
			'/app/explore/arxiv%3A2401.001'
		);
		const externalOnly: DiscoveryItem = {
			...feedItemToDiscoveryItem(bareFeed),
			paperKey: undefined
		};
		expect(feedDetailHref(externalOnly)).toBeNull();
	});
});
