// `PaperExtractionStatus` lives in this pure model module (not in a render component) so
// components and tests can import it without coupling the model layer to UI.
export type PaperExtractionStatus =
	| {
			extraction: {
				status: 'pending' | 'running' | 'ready' | 'failed';
				failureReason?: string;
				updatedAt: number;
			} | null;
			metadata: {
				title?: string;
				abstract?: string;
				doi?: string;
				authors: Array<{ name: string; affiliation?: string }>;
				affiliations: string[];
				journal?: string;
				publisher?: string;
				publishedYear?: number;
				keywords: string[];
				confidence?: number;
			} | null;
	  }
	| undefined;

type PaperMetadata = NonNullable<NonNullable<PaperExtractionStatus>['metadata']>;

export type PaperMetadataView = {
	/** Metadata to render, or null when there is nothing usable to show. */
	metadata: PaperMetadata | null;
	hasUsableMetadata: boolean;
	/** Extraction still running and no metadata resolved yet. */
	paperPending: boolean;
	/** Extraction failed AND no metadata came from any source — safe to alarm. */
	paperFailed: boolean;
};

/**
 * Decide what paper metadata UI to show for an artifact.
 *
 * Bibliographic metadata can be resolved (DOI/arXiv → Crossref/OpenAlex, or an
 * LLM/GROBID pass) independently of the artifact's `detectedDocumentKind`
 * classification, so we surface whatever metadata is usable rather than gating
 * on `scholarly_paper`. A failed GROBID pass is only alarming when we have no
 * usable metadata from any source.
 */
export function derivePaperMetadataView(input: {
	isPdf: boolean;
	paperExtraction: PaperExtractionStatus;
}): PaperMetadataView {
	const raw = input.paperExtraction?.metadata ?? null;
	const hasUsableMetadata = Boolean(raw && (raw.title || raw.abstract || raw.authors.length > 0));
	const metadata = hasUsableMetadata ? raw : null;

	const status = input.paperExtraction?.extraction?.status;
	const paperPending =
		input.isPdf && !hasUsableMetadata && (status === 'pending' || status === 'running');
	const paperFailed = input.isPdf && status === 'failed' && !hasUsableMetadata;

	return { metadata, hasUsableMetadata, paperPending, paperFailed };
}
