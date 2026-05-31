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
