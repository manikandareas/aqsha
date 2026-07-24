import type { SearchSourceInput } from '$lib/features/citations/types';
import {
	discoveryItemKey,
	feedDetailHref,
	type DiscoveryItem
} from '$lib/features/discovery/model';
import type { LiteraturePaper } from './literature-search-types';

export type ExploreSource = {
	key: string;
	title: string;
	summary: string | null;
	href: string;
	external: boolean;
	url: string | null;
	pdfUrl: string | null;
	doi: string | null;
	authors: string[];
	year: number | null;
	venue: string | null;
	citedByCount: number | null;
	isOpenAccess: boolean;
	topics: string[];
	isRetracted: boolean;
	hasPdf: boolean;
};

export function discoveryItemToExploreSource(item: DiscoveryItem): ExploreSource {
	const detailHref = feedDetailHref(item);

	return {
		key: discoveryItemKey(item),
		title: item.title,
		summary: item.tldr ?? item.summary ?? null,
		href: detailHref ?? item.resolvedUrl ?? item.url,
		external: detailHref === null,
		url: item.url ?? null,
		pdfUrl: item.pdfUrl ?? null,
		doi: item.doi ?? null,
		authors: item.authors ?? [],
		year: item.year ?? null,
		venue: item.venue ?? null,
		citedByCount: item.citedByCount ?? null,
		isOpenAccess: item.isOpenAccess ?? false,
		topics: item.topics,
		isRetracted: item.retractionStatus === 'retracted',
		hasPdf: Boolean(item.pdfUrl)
	};
}

export function literaturePaperToExploreSource(paper: LiteraturePaper): ExploreSource {
	return {
		key: paper.key,
		title: paper.title,
		summary: paper.snippet,
		href: `/app/explore/${encodeURIComponent(paper.key)}`,
		external: false,
		url: paper.url ?? null,
		pdfUrl: paper.pdfUrl ?? null,
		doi: paper.doi ?? null,
		authors: paper.authors,
		year: paper.year ?? null,
		venue: paper.venue ?? null,
		citedByCount: paper.citedByCount ?? null,
		isOpenAccess: paper.isOpenAccess,
		topics: paper.topics,
		isRetracted: paper.isRetracted,
		hasPdf: paper.hasPdf || Boolean(paper.pdfUrl)
	};
}

export function exploreSourceToSearchInput(source: ExploreSource): SearchSourceInput {
	return {
		clientKey: source.key,
		title: source.title,
		doi: source.doi,
		url: source.url,
		authors: source.authors,
		year: source.year,
		venue: source.venue
	};
}
