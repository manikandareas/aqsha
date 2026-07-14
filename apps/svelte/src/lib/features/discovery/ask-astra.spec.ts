import { buildExternalPaperMentionLabel, buildNewsMentionLabel } from '@aqsha/chat-core';
import { describe, expect, it } from 'vitest';
import { discoveryItemToContextRef } from './ask-astra';
import { feedItemToDiscoveryItem, paperToDiscoveryItem, type DiscoveryItem } from './model';
import type { ExplorePaper, FeedItem } from './types';

// EXACT Ask Astra payload contract (§11.2 / EXP-5 ★). The ContextRef a card/reader pins onto the
// composer must be byte-for-byte identical to `apps/web/features/discovery/ask-astra.ts` — a drift here
// changes what Astra hydrates.

const searchPaper: Omit<ExplorePaper, 'lastSeenAt'> = {
	key: 'arxiv:2401.001',
	title: 'Emergent tool use in multi-agent systems',
	snippet: 's',
	url: 'https://arxiv.org/abs/2401.001',
	provider: 'arxiv',
	sourceLabel: 'arXiv',
	authors: [],
	topics: []
};

const paperFeed: FeedItem = {
	_id: 'f1',
	kind: 'paper',
	title: 'Paper title',
	summary: 's',
	url: 'https://x',
	provider: 'p',
	sourceLabel: 'P',
	paperKey: 'openalex:W99',
	topics: []
};

const newsFeed: FeedItem = {
	_id: 'n1',
	kind: 'news',
	title: 'A breaking headline',
	summary: 's',
	url: 'https://x',
	provider: 'gdelt',
	sourceLabel: 'News',
	topics: []
};

describe('discoveryItemToContextRef', () => {
	it('maps a search paper → explore-paper with the external-paper label', () => {
		expect(discoveryItemToContextRef(paperToDiscoveryItem(searchPaper))).toEqual({
			kind: 'explore-paper',
			paperKey: 'arxiv:2401.001',
			label: buildExternalPaperMentionLabel('Emergent tool use in multi-agent systems')
		});
	});

	it('maps a paper feed row (feed ref but carries paperKey) → explore-paper by paperKey', () => {
		expect(discoveryItemToContextRef(feedItemToDiscoveryItem(paperFeed))).toEqual({
			kind: 'explore-paper',
			paperKey: 'openalex:W99',
			label: buildExternalPaperMentionLabel('Paper title')
		});
	});

	it('maps a news feed row → news by feedItemId', () => {
		expect(discoveryItemToContextRef(feedItemToDiscoveryItem(newsFeed))).toEqual({
			kind: 'news',
			feedItemId: 'n1',
			label: buildNewsMentionLabel('A breaking headline')
		});
	});

	it('returns null when a feed item has neither paperKey nor a feed ref path', () => {
		const orphan: DiscoveryItem = {
			...feedItemToDiscoveryItem(newsFeed),
			paperKey: undefined,
			itemRef: { kind: 'paper', paperKey: '' }
		};
		// paperKey resolves to '' (falsy) and itemRef is not 'feed' → null.
		expect(discoveryItemToContextRef(orphan)).toBeNull();
	});
});
