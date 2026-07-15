// "Tanya Astra" util: turn a discovery item (paper/news) into a composer context token (ContextRef).
// Used by the Explore reader pages (page token) and the feed/related cards (Tanya Astra → open panel +
// pin that item's token). The label carries the FULL title — the pill is truncated by CSS (token-pill),
// the full detail shows in the tooltip. Contract-tested (`ask-astra.spec.ts`).

import {
	buildExternalPaperMentionLabel,
	buildNewsMentionLabel,
	type ContextRef
} from '@aqsha/chat-core';
import type { DiscoveryItem } from './model';

/**
 * Map a discovery item → context token. A paper (has `paperKey`, from search results or a paper feed row)
 * becomes `explore-paper` (hydrate via OpenAlex); otherwise (news/feed) becomes `news` (hydrate via feed
 * item). Null when it can't be represented.
 */
export function discoveryItemToContextRef(item: DiscoveryItem): ContextRef | null {
	const title = item.title;
	const paperKey = item.itemRef.kind === 'paper' ? item.itemRef.paperKey : item.paperKey;
	if (paperKey) {
		return { kind: 'explore-paper', paperKey, label: buildExternalPaperMentionLabel(title) };
	}
	if (item.itemRef.kind === 'feed') {
		return {
			kind: 'news',
			feedItemId: item.itemRef.feedItemId,
			label: buildNewsMentionLabel(title)
		};
	}
	return null;
}
