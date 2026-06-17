import { v } from "convex/values";

export type Provider =
  | "openalex"
  | "crossref"
  | "arxiv"
  | "exa"
  | "jina_search"
  | "jina_read"
  | "jina_rerank"
  | "explore"
  | "paper_ingest"
  | "google_factcheck"
  | "gdelt"
  | "google_news";

export const providerValidator = v.union(
  v.literal("crossref"),
  v.literal("openalex"),
  v.literal("arxiv"),
  v.literal("exa"),
  v.literal("jina_search"),
  v.literal("jina_read"),
  v.literal("jina_rerank"),
  v.literal("explore"),
  v.literal("paper_ingest"),
  v.literal("google_factcheck"),
  v.literal("gdelt"),
  // Raw Google News RSS results are cached under this provider key (the feed
  // news lane). Must stay in sync with the inline `externalLookupCache.provider`
  // union in schema.ts, or getCache/putCache throw ArgumentValidationError.
  v.literal("google_news"),
);
