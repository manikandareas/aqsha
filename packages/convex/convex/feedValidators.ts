import { v } from "convex/values";

export const feedItemKindValidator = v.union(
  v.literal("paper"),
  v.literal("news"),
  v.literal("claim"),
  v.literal("topic"),
  v.literal("idea"),
);

export const feedProviderValidator = v.union(
  v.literal("openalex"),
  v.literal("exa_news"),
  v.literal("gdelt"),
  v.literal("google_factcheck"),
  v.literal("turnbackhoax"),
);

// Verdict taxonomy for the fact/hoax lane. Reuses the semantics of the
// existing `citationChecks.support` union and adds two non-binary states
// (`needs_context`, `unverified`) per the research guardrails.
export const feedVerdictValidator = v.union(
  v.literal("supported"),
  v.literal("partially_supported"),
  v.literal("needs_context"),
  v.literal("unverified"),
  v.literal("contradicted"),
);

export const feedRetractionStatusValidator = v.union(
  v.literal("none"),
  v.literal("concern"),
  v.literal("retracted"),
);

export const feedClaimSummaryValidator = v.object({
  claim: v.string(),
  verdict: feedVerdictValidator,
  verdictSource: v.string(),
  verdictBy: v.union(v.literal("human"), v.literal("ai")),
  verdictLabelRaw: v.string(),
  publisher: v.optional(v.string()),
  reviewUrl: v.optional(v.string()),
  reviewedAt: v.optional(v.number()),
  evidence: v.optional(v.string()),
  confidence: v.optional(v.number()),
  severity: v.optional(
    v.union(v.literal("info"), v.literal("warning"), v.literal("high")),
  ),
  supportingPaperKeys: v.optional(v.array(v.string())),
});

export const feedItemFields = {
  kind: feedItemKindValidator,
  title: v.string(),
  summary: v.string(),
  // One-sentence machine summary (skim aid). `tldrId` is the Bahasa
  // Indonesia rendition for the ID-first comprehension layer.
  tldr: v.optional(v.string()),
  tldrId: v.optional(v.string()),
  titleId: v.optional(v.string()),
  url: v.string(),
  imageUrl: v.optional(v.string()),
  provider: feedProviderValidator,
  sourceLabel: v.string(),
  // Resolves to the shared `explorePapers` cache so feed papers reuse the
  // existing detail page + getPaper path without duplicating rows.
  paperKey: v.optional(v.string()),
  doi: v.optional(v.string()),
  topics: v.array(v.string()),
  trendScore: v.number(),
  // Credibility signals shown on paper cards.
  retractionStatus: v.optional(feedRetractionStatusValidator),
  primaryClaim: v.optional(feedClaimSummaryValidator),
  stanceSupporting: v.optional(v.number()),
  stanceContrasting: v.optional(v.number()),
  // Mixed-media mini-chart series (e.g. GDELT topic volume timeline or a
  // paper attention trend). Kept tiny; rendered as a sparkline.
  sparkline: v.optional(v.array(v.number())),
  publishedAt: v.optional(v.number()),
  dedupeKey: v.string(),
  lastSeenAt: v.number(),
  createdAt: v.number(),
};

export const feedItemValidator = v.object(feedItemFields);
