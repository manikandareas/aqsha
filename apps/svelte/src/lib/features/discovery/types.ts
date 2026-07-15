/**
 * Local `FeedItem` subset for component props. apps/svelte must not import `@aqsha/services` (client
 * boundary); Eden still types the route response — this only lists fields the UI renders.
 */
export type FeedKind = 'paper' | 'news';

export type FeedItem = {
	_id: string;
	kind: FeedKind;
	title: string;
	summary: string;
	tldr?: string;
	url: string;
	resolvedUrl?: string;
	imageUrl?: string;
	provider: string;
	sourceLabel: string;
	paperKey?: string;
	doi?: string;
	authors?: string[];
	year?: number;
	venue?: string;
	citedByCount?: number;
	isOpenAccess?: boolean;
	topics: string[];
	retractionStatus?: 'none' | 'concern' | 'retracted';
	relevanceScore?: number;
	reason?: string;
	publishedAt?: number;
	// paper-only hosted PDF; absent for news.
	pdfUrl?: string;
	// news-only: extracted article body (enrichment lane). Rendered in NewsReader.
	articleText?: string;
};

export type DiscoveryItemRef =
	{ kind: 'feed'; feedItemId: string } | { kind: 'paper'; paperKey: string };

export type ExplorePaper = {
	key: string;
	title: string;
	snippet: string;
	abstract?: string;
	url: string;
	pdfUrl?: string;
	doi?: string;
	arxivId?: string;
	openalexId?: string;
	provider: string;
	sourceLabel: string;
	authors: string[];
	year?: number;
	publicationDate?: string;
	venue?: string;
	citedByCount?: number;
	isOpenAccess?: boolean;
	topics: string[];
	score?: number;
	lastSeenAt: number;
	enriched?: PaperEnrichment;
};

// OpenAlex single-work enrichment — local copy of the GET /papers/detail shape (client boundary; no @aqsha/services import).
export type PaperEnrichmentRef = {
	openalexId: string;
	title: string;
	year?: number;
	doi?: string;
	citedByCount?: number;
};
export type PaperEnrichmentAuthor = { name: string; institution?: string; country?: string };
export type PaperYearCount = { year: number; citedByCount: number };
export type PaperWeighted = { name: string; score?: number };
export type PaperEnrichment = {
	oaStatus?: string;
	oaUrl?: string;
	license?: string;
	journal?: string;
	issn?: string[];
	type?: string;
	language?: string;
	fwci?: number;
	citationPercentile?: number;
	countsByYear: PaperYearCount[];
	authors: PaperEnrichmentAuthor[];
	institutions: string[];
	countries: string[];
	concepts: PaperWeighted[];
	sdgs: PaperWeighted[];
	funders: string[];
	referencedCount: number;
	references: PaperEnrichmentRef[];
	citedByCount?: number;
	citedBy: PaperEnrichmentRef[];
	relatedCount: number;
	related: PaperEnrichmentRef[];
};

/** Internal reader link per kind. paper→/[key], news→/n/[id]; else→external. */
export function feedItemHref(item: FeedItem): { href: string; external: boolean } {
	if (item.kind === 'paper' && item.paperKey) {
		return { href: `/app/explore/${encodeURIComponent(item.paperKey)}`, external: false };
	}
	if (item.kind === 'news') return { href: `/app/explore/n/${item._id}`, external: false };
	return { href: item.resolvedUrl ?? item.url, external: true };
}

export type FeedMode = 'foryou' | 'top' | 'topics';
export type FeedTopic =
	'sains_teknologi' | 'kesehatan' | 'lingkungan' | 'sosial_ekonomi' | 'pendidikan';

export const FEED_TOPIC_LABELS: Record<FeedTopic, string> = {
	sains_teknologi: 'Sains & Teknologi',
	kesehatan: 'Kesehatan',
	lingkungan: 'Lingkungan',
	sosial_ekonomi: 'Sosial & Ekonomi',
	pendidikan: 'Pendidikan'
};

export const KIND_LABELS: Record<FeedKind, string> = {
	paper: 'Paper',
	news: 'Berita'
};
