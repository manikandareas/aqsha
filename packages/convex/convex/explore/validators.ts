import { v } from "convex/values";

export const exploreProviderValidator = v.union(
  v.literal("OpenAlex"),
  v.literal("arXiv"),
  v.literal("Exa"),
  v.literal("Jina"),
  v.literal("Crossref"),
);

export const explorePaperFields = {
  key: v.string(),
  title: v.string(),
  snippet: v.string(),
  abstract: v.optional(v.string()),
  url: v.string(),
  pdfUrl: v.optional(v.string()),
  doi: v.optional(v.string()),
  arxivId: v.optional(v.string()),
  openalexId: v.optional(v.string()),
  provider: exploreProviderValidator,
  sourceLabel: v.string(),
  authors: v.array(v.string()),
  year: v.optional(v.number()),
  publicationDate: v.optional(v.string()),
  venue: v.optional(v.string()),
  citedByCount: v.optional(v.number()),
  isOpenAccess: v.optional(v.boolean()),
  topics: v.array(v.string()),
  score: v.optional(v.number()),
};

export const explorePaperValidator = v.object(explorePaperFields);

// Shared wire shape for the per-candidate `metadataJson` blob that providers
// (OpenAlex, Exa, Jina, Crossref, arXiv) stringify into `ExternalCandidate`
// and the explore mapper parses back out. Lives in this leaf validator module
// so both the provider layer (`agent/openalexProvider`) and the explore mapper
// (`exploreModel`) can import it without creating an import cycle.
export type ExploreCandidateMetadata = {
  authors?: string[];
  year?: number;
  publicationDate?: string;
  venue?: string;
  citedByCount?: number;
  isOpenAccess?: boolean;
  pdfUrl?: string;
  openalexId?: string;
  topics?: string[];
  score?: number;
  sourceLabel?: string;
};
