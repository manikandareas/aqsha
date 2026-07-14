import { describe, expect, it } from 'vitest';
import { buildFeedBlocks } from './feed-blocks';
import { feedItemToDiscoveryItem, type DiscoveryItem } from '$lib/features/discovery/model';
import { HOUSE_ADS } from '$lib/features/discovery/house-ads';
import type { FeedItem } from '$lib/features/discovery/types';

// Feed block rhythm contract (§11.2 "feed fixture output"): grid(6) → feature → grid → ad → …
// Must match `buildFeedBlocks` in `apps/web/features/explore/components/explore-findings.tsx`.

function items(n: number): DiscoveryItem[] {
	return Array.from({ length: n }, (_, i) =>
		feedItemToDiscoveryItem({
			_id: `f${i}`,
			kind: 'news',
			title: `t${i}`,
			summary: 's',
			url: 'https://x',
			provider: 'p',
			sourceLabel: 'P',
			topics: []
		} satisfies FeedItem)
	);
}

describe('buildFeedBlocks', () => {
	it('chunks into a 6-up grid then a single feature (alternating side)', () => {
		const blocks = buildFeedBlocks(items(14), false);
		// 14 = grid(6) + feature(1) + grid(6) + feature(1) → but no ads (includeAds=false).
		expect(blocks.map((b) => b.kind)).toEqual(['grid', 'feature', 'grid', 'feature']);
		const grids = blocks.filter((b) => b.kind === 'grid');
		expect(grids[0].kind === 'grid' && grids[0].items.length).toBe(6);
		const features = blocks.filter((b) => b.kind === 'feature');
		expect(features[0].kind === 'feature' && features[0].side).toBe('left');
		expect(features[1].kind === 'feature' && features[1].side).toBe('right');
	});

	it('interleaves the first house-ad after the first grid, then every 2 grids (includeAds)', () => {
		// Enough items to reach the 2nd house-ad: grid,feat repeated. 6*4 + 3 features spread.
		const blocks = buildFeedBlocks(items(30), true);
		const kinds = blocks.map((b) => b.kind);
		// First ad lands right after grid #1 (AD_FIRST_AFTER_GRID=1), before the following feature.
		const firstGrid = kinds.indexOf('grid');
		expect(kinds[firstGrid + 1]).toBe('ad');
		const ads = blocks.filter((b) => b.kind === 'ad');
		expect(ads.map((a) => (a.kind === 'ad' ? a.ad.id : ''))).toEqual(
			HOUSE_ADS.slice(0, ads.length).map((a) => a.id)
		);
	});

	it('never emits ads when includeAds is false (search mode)', () => {
		expect(buildFeedBlocks(items(40), false).some((b) => b.kind === 'ad')).toBe(false);
	});

	it('caps ads at HOUSE_ADS.length even for a very long feed', () => {
		const ads = buildFeedBlocks(items(400), true).filter((b) => b.kind === 'ad');
		expect(ads.length).toBe(HOUSE_ADS.length);
	});

	it('returns an empty list for no items', () => {
		expect(buildFeedBlocks([], true)).toEqual([]);
	});
});
