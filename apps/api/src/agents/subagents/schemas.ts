import { z } from "zod";

export const sourceClassEnum = z.enum([
  "academic",
  "news",
  "policy",
  "primary",
  "expert",
]);

export const sourceClassWithUnknownEnum = z.enum([
  "academic",
  "news",
  "policy",
  "primary",
  "expert",
  "unknown",
]);

export const researchDepthEnum = z.enum(["quick_scan", "standard_brief", "deep_report"]);

export const decisionEnum = z.enum(["PROCEED", "REFINE", "PIVOT"]);

export const researchSubQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  sourceClasses: z.array(sourceClassEnum).min(1),
  minSources: z.number().int().min(1).max(10),
});

export const researchPlanSchema = z.object({
  question: z.string().min(1),
  depth: researchDepthEnum,
  subQuestions: z.array(researchSubQuestionSchema).min(1).max(8),
  successCriteria: z.array(z.string()).min(1),
  exclusions: z.array(z.string()),
});

export type ResearchPlan = z.infer<typeof researchPlanSchema>;
export type ResearchSubQuestion = z.infer<typeof researchSubQuestionSchema>;

// NOTE: avoid `.url()` here. OpenAI structured-output mode rejects JSON Schema
// `format: "uri"`. We validate URLs at the application boundary if needed.
export const searchCandidateSchema = z.object({
  title: z.string().min(1),
  url: z.string().min(1),
  snippet: z.string(),
  publishedDate: z.string().nullable(),
  sourceClass: sourceClassWithUnknownEnum,
  relevanceScore: z.number().min(0).max(1),
});

export const searchResultsSchema = z.object({
  subQuestionId: z.string().min(1),
  candidates: z.array(searchCandidateSchema).max(15),
});

export type SearchCandidate = z.infer<typeof searchCandidateSchema>;
export type SearchResults = z.infer<typeof searchResultsSchema>;

export const evidenceClaimSchema = z.object({
  text: z.string().min(1),
  quote: z.string().nullable(),
  importantNumbers: z.array(
    z.object({
      value: z.string(),
      unit: z.string().nullable(),
    }),
  ),
  confidence: z.enum(["high", "medium", "low"]),
});

export const evidenceCardSchema = z.object({
  sourceUrl: z.string().min(1),
  sourceTitle: z.string().min(1),
  claims: z.array(evidenceClaimSchema).min(1),
  tier: z.enum(["A", "B", "C", "D"]),
  qualityScore: z.number().int().min(0).max(3),
  notes: z.string().nullable(),
});

export const evidenceCardsSchema = z.object({
  cards: z.array(evidenceCardSchema),
});

export type EvidenceCard = z.infer<typeof evidenceCardSchema>;
export type EvidenceCards = z.infer<typeof evidenceCardsSchema>;

export const synthesisSchema = z.object({
  themes: z.array(
    z.object({
      heading: z.string().min(1),
      evidence: z.array(z.string()).min(1),
    }),
  ),
  conflicts: z.array(
    z.object({
      topic: z.string().min(1),
      positions: z.array(z.string()).min(2),
    }),
  ),
  gaps: z.array(z.string()),
  decision: decisionEnum,
});

export type Synthesis = z.infer<typeof synthesisSchema>;

export const criticSchema = z.object({
  ok: z.boolean(),
  issues: z.array(
    z.object({
      kind: z.enum([
        "fabricated_citation",
        "missing_citation",
        "unverifiable_quote",
        "numeric_mismatch",
        "conflict_undisclosed",
        "weak_source_for_claim",
      ]),
      detail: z.string().min(1),
      citationId: z.string().nullable(),
    }),
  ),
});

export type CriticReport = z.infer<typeof criticSchema>;

export const bibliographyEntrySchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  title: z.string().min(1),
});

export type BibliographyEntry = z.infer<typeof bibliographyEntrySchema>;
