/**
 * Local `FeedItem` subset for component props. apps/web must not import `@aqsha/services` (client
 * boundary); Eden still types the route response — this only lists fields the UI renders.
 */
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
