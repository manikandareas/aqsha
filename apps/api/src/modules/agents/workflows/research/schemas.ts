import { z } from "zod";

/**
 * Candidate source discovered by the researcher (e.g. a Websets item or a
 * WebSearch hit). Candidates are *not* evidence until they're fetched and
 * confirmed to have citation-quality content. See design v2 §6.
 */
export const candidateSourceSchema = z.object({
  candidateId: z.string().min(1),
  // Aligns with DB enum agentCandidateSourceOrigins:
  //   qdrant  = candidate came from Qdrant similarity or qdrant_related chunks
  //   websets = candidate came from Exa Websets
  //   model   = candidate came from model's WebSearch / WebFetch / manual
  origin: z.enum(["qdrant", "websets", "model"]),
  // Aligns with DB enum agentCandidateSourceStatuses:
  //   candidate = newly discovered
  //   accepted  = fetched + promoted to evidence
  //   rejected  = rejected (thin/duplicate/off-topic)
  status: z
    .enum(["candidate", "accepted", "rejected"])
    .default("candidate"),
  title: z.string().default(""),
  url: z.string().nullable().optional(),
  doi: z.string().nullable().optional(),
  externalId: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
});

/**
 * An evidence item that passed the promotion thresholds (design v2 §6):
 * at least one verbatim quote and a resolvable source identifier. Every
 * evidence item has a stable string ID chosen by the researcher (e.g.
 * "ev_01"). The critic references these IDs from each claim's `evidenceIds`;
 * the synthesizer does not emit evidence items directly.
 */
export const evidenceItemSchema = z.object({
  evidenceId: z.string().min(1),
  // Aligns with DB enum agentEvidenceSources. Use "manual" for WebSearch /
  // WebFetch / model-provided sources.
  source: z.enum(["qdrant", "websets", "manual"]).default("manual"),
  provenance: z
    .enum(["retrieved", "model_cited", "audited"])
    .default("retrieved"),
  candidateId: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  quote: z.string().min(1),
});

/**
 * A claim the critic has extracted from the evidence pool. `claimId` is a
 * stable string (e.g. "c_01"). `evidenceIds` references the researcher's
 * persisted evidence pool — this is the grounding chain that citationAudit
 * enforces (design v2 §12).
 */
export const claimSchema = z.object({
  claimId: z.string().min(1),
  statement: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  supported: z.boolean(),
  evidenceIds: z.array(z.string()).default([]),
});

export const planSchema = z.object({
  status: z
    .enum(["approved", "needs_revision", "cancelled"])
    .default("approved"),
  researchQuestions: z.array(z.string()).min(1),
  searchQueries: z.array(z.string()).default([]),
  requiredEvidence: z.array(z.string()).default([]),
  clarifyingQuestions: z.array(z.string()).default([]),
  revisionNotes: z.string().default(""),
});

export const researchSchema = z.object({
  candidateSources: z.array(candidateSourceSchema).default([]),
  evidenceItems: z.array(evidenceItemSchema).default([]),
  queriesUsed: z.array(z.string()).default([]),
  coverageAssessment: z
    .enum(["sufficient", "partial", "insufficient"])
    .default("partial"),
  coverageNotes: z.string().default(""),
});

export const criticSchema = z.object({
  claims: z.array(claimSchema).default([]),
  gaps: z.array(z.string()).default([]),
  nextQueries: z.array(z.string()).default([]),
  evidenceSufficient: z.boolean(),
  iterationRecommendation: z.string().default(""),
});

export const synthesisSchema = z.object({
  answer: z.string().min(1),
  claimIdsUsed: z.array(z.string()).default([]),
  hasLimitations: z.boolean().default(false),
  limitationsText: z.string().default(""),
});

export const citationAuditSchema = z.object({
  passed: z.boolean(),
  warnings: z.array(z.string()).default([]),
  failures: z.array(z.string()).default([]),
  supportedClaimCount: z.number().int().nonnegative(),
});

export type CandidateSource = z.infer<typeof candidateSourceSchema>;
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type ResearchPlan = z.infer<typeof planSchema>;
export type ResearchResult = z.infer<typeof researchSchema>;
export type CriticResult = z.infer<typeof criticSchema>;
export type SynthesisResult = z.infer<typeof synthesisSchema>;
export type CitationAuditResult = z.infer<typeof citationAuditSchema>;

export function toSdkJsonSchema(schema: z.ZodType) {
  return {
    type: "json_schema" as const,
    schema: z.toJSONSchema(schema) as Record<string, unknown>,
  };
}
