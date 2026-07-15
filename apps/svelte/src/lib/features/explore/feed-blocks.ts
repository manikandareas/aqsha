// Editorial feed rhythm (option 4): a 3-up grid every GRID_CHUNK items, then one
// full-width feature (alternating left/right). A house-ad (option 2) is interleaved
// after the first grid then every AD_CADENCE grids, pulling campaigns in order from
// HOUSE_ADS until exhausted → adding entries to that array shows them automatically
// (non-search only). The hero (items[0]) is rendered separately above.
//
// (`buildFeedBlocks`) so the block layout is contract-testable (`feed-blocks.spec.ts`).

import { discoveryItemKey, type DiscoveryItem } from '$lib/features/discovery/model';
import { HOUSE_ADS, type HouseAd } from '$lib/features/discovery/house-ads';

export type FeedBlock =
	| { kind: 'grid'; key: string; items: DiscoveryItem[] }
	| { kind: 'feature'; key: string; item: DiscoveryItem; side: 'left' | 'right' }
	| { kind: 'ad'; key: string; ad: HouseAd };

const GRID_CHUNK = 6;
const AD_FIRST_AFTER_GRID = 1;
const AD_CADENCE = 2;

export function buildFeedBlocks(rest: DiscoveryItem[], includeAds: boolean): FeedBlock[] {
	const blocks: FeedBlock[] = [];
	let p = 0;
	let gridN = 0;
	let adN = 0;
	while (p < rest.length) {
		const chunk = rest.slice(p, p + GRID_CHUNK);
		p += chunk.length;
		blocks.push({ kind: 'grid', key: `grid-${gridN}`, items: chunk });
		gridN += 1;
		if (
			includeAds &&
			adN < HOUSE_ADS.length &&
			gridN >= AD_FIRST_AFTER_GRID &&
			(gridN - AD_FIRST_AFTER_GRID) % AD_CADENCE === 0
		) {
			blocks.push({ kind: 'ad', key: `ad-${HOUSE_ADS[adN]!.id}`, ad: HOUSE_ADS[adN]! });
			adN += 1;
		}
		if (p < rest.length) {
			const item = rest[p]!;
			p += 1;
			// featN ≡ gridN-1 at each feature-push → alternate side without a separate counter.
			blocks.push({
				kind: 'feature',
				key: `feature-${discoveryItemKey(item)}`,
				item,
				side: (gridN - 1) % 2 === 0 ? 'left' : 'right'
			});
		}
	}
	return blocks;
}
