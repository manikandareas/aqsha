export const LITERATURE_SORT_IDS = [
	'relevance',
	'publication_date_desc',
	'publication_date_asc',
	'citations_desc',
	'fwci_desc',
	'authors_desc',
	'references_desc'
] as const;

export type LiteratureSortId = (typeof LITERATURE_SORT_IDS)[number];

export type LiteratureFilterValue =
	string | boolean | string[] | { min?: number | string; max?: number | string };

export type LiteratureFilterId =
	| 'publication_date'
	| 'work_type'
	| 'language'
	| 'venue'
	| 'issn'
	| 'publisher'
	| 'indexed_in'
	| 'open_access'
	| 'oa_status'
	| 'has_pdf'
	| 'has_fulltext'
	| 'open_version'
	| 'repository_fulltext'
	| 'license'
	| 'doaj'
	| 'core_source'
	| 'apc_list_usd'
	| 'apc_paid_usd'
	| 'apc_currency'
	| 'citation_count'
	| 'fwci'
	| 'citation_top_10'
	| 'citation_top_1'
	| 'authors_count'
	| 'references_count'
	| 'author'
	| 'author_orcid'
	| 'corresponding_author'
	| 'institution'
	| 'institution_type'
	| 'institution_country'
	| 'institution_continent'
	| 'institution_global_south'
	| 'topic'
	| 'subfield'
	| 'field'
	| 'domain'
	| 'concept'
	| 'keyword'
	| 'sdg'
	| 'funder'
	| 'award'
	| 'cites'
	| 'cited_by'
	| 'related_to'
	| 'has_abstract'
	| 'has_doi'
	| 'has_references'
	| 'retraction';

export type LiteratureFilterClause = {
	id: LiteratureFilterId;
	value: LiteratureFilterValue;
};

export type LiteratureFilterKind =
	'date-range' | 'number-range' | 'toggle' | 'select' | 'multi-select' | 'entity' | 'text';

export type LiteratureFilterCategoryId =
	'publication' | 'access' | 'impact' | 'authorship' | 'research' | 'funding' | 'integrity';

export type LiteratureEntityKind =
	| 'works'
	| 'authors'
	| 'sources'
	| 'institutions'
	| 'concepts'
	| 'publishers'
	| 'funders'
	| 'topics'
	| 'keywords';

export type LiteratureFilterDefinition = {
	id: LiteratureFilterId;
	category: LiteratureFilterCategoryId;
	label: string;
	kind: LiteratureFilterKind;
	entityKind?: LiteratureEntityKind;
	options?: Array<{ value: string; label: string }>;
};

export type PublicLiteratureCatalog = {
	categories: Array<{ id: LiteratureFilterCategoryId; label: string }>;
	filters: LiteratureFilterDefinition[];
	sorts: Array<{ id: LiteratureSortId; label: string }>;
};

export type LiteraturePaper = {
	key: string;
	title: string;
	snippet: string | null;
	doi: string | null;
	url: string | null;
	pdfUrl: string | null;
	hasPdf: boolean;
	authors: string[];
	year: number | null;
	publicationDate: string | null;
	venue: string | null;
	citedByCount: number | null;
	isOpenAccess: boolean;
	oaStatus: string | null;
	workType: string | null;
	language: string | null;
	isRetracted: boolean;
	topics: string[];
};

export type LiteratureSearchPage = {
	items: LiteraturePaper[];
	total: number | null;
	nextCursor: string | null;
	cached: boolean;
};

export type LiteratureAutocompleteItem = {
	id: string;
	label: string;
	hint: string | null;
	entityType: LiteratureEntityKind;
};

export function isLiteratureSortId(value: unknown): value is LiteratureSortId {
	return typeof value === 'string' && (LITERATURE_SORT_IDS as readonly string[]).includes(value);
}
