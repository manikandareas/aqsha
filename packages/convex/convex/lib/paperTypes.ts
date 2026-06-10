// Shared, dependency-free paper-domain types. Leaf module so it can be imported
// from both `paperIngest/` (metadata resolver) and `paperExtraction/` (TEI/GROBID
// parser) without creating a cross-domain import cycle.

/**
 * A single paper author: display name plus an optional primary affiliation.
 * Aliased by `ResolvedPaperAuthor` (paperIngest) and `ParsedPaperAuthor`
 * (paperExtraction) so the two domains share one canonical shape.
 */
export type PaperAuthor = { name: string; affiliation?: string };
