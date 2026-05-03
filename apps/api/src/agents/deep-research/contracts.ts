import { z } from "zod";

const metadataSchema = z.record(z.string(), z.unknown());
const nonEmptyStringArraySchema = z.array(z.string().min(1)).min(1);
const verificationStatusSchema = z.enum(["verified", "partially_verified", "unverified"]);

export const evidenceSourceSchema = z
  .object({
    sourceId: z.string().min(1),
    title: z.string().min(1),
    sourceType: z.string().min(1),
    url: z.string().url().optional(),
    doi: z.string().min(1).optional(),
    publishedAt: z.string().min(1).optional(),
    accessedAt: z.string().min(1).optional(),
    verificationStatus: verificationStatusSchema,
    metadata: metadataSchema.optional(),
  })
  .strict();

export const evidenceClaimSchema = z
  .object({
    claimId: z.string().min(1),
    claimText: z.string().min(1),
    claimType: z.enum(["factual", "numeric", "causal", "comparative", "legal", "forecast", "recommendation"]),
    supportingSourceIds: nonEmptyStringArraySchema,
    counterSourceIds: z.array(z.string().min(1)).default([]),
    evidenceStrength: z.enum(["high", "medium", "low", "insufficient"]),
    verificationStatus: verificationStatusSchema,
    metadata: metadataSchema.optional(),
  })
  .strict();

export const visualMetricSchema = z
  .object({
    metricId: z.string().min(1),
    label: z.string().min(1),
    value: z.union([z.number(), z.string().min(1)]),
    unit: z.string().min(1).optional(),
    sourceIds: nonEmptyStringArraySchema,
    metadata: metadataSchema.optional(),
  })
  .strict();

export const visualDataReferenceSchema = z
  .object({
    referenceType: z.enum(["source", "claim", "metric"]),
    referenceId: z.string().min(1),
  })
  .strict();

export const researchPlanSchema = z
  .object({
    researchQuestion: z.string().min(1),
    scope: z.string().min(1),
    subQuestions: nonEmptyStringArraySchema,
    searchStrategy: nonEmptyStringArraySchema,
    sourceCriteria: nonEmptyStringArraySchema,
    exclusions: z.array(z.string().min(1)).default([]),
    expectedEvidenceTypes: nonEmptyStringArraySchema,
    reconnaissanceNotes: z.string().min(1).optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const evidenceLedgerSchema = z
  .object({
    sources: z.array(evidenceSourceSchema).min(1),
    claims: z.array(evidenceClaimSchema).default([]),
    visualMetrics: z.array(visualMetricSchema).default([]),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const visualSpecSchema = z
  .object({
    visualId: z.string().min(1),
    visualKind: z.enum([
      "search_flow",
      "timeline",
      "claims_evidence",
      "research_gap_matrix",
      "contributor_chart",
      "source_map",
    ]),
    title: z.string().min(1),
    labels: nonEmptyStringArraySchema,
    dataReferences: z.array(visualDataReferenceSchema).min(1),
    sourceIds: nonEmptyStringArraySchema,
    metricIds: z.array(z.string().min(1)).default([]),
    claimIds: z.array(z.string().min(1)).default([]),
    caption: z.string().min(1),
    outputIntent: z.enum(["final_report_embed", "research_trail_preview", "audit_only"]),
    displayOrder: z.number().int().nonnegative().optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const researchDecisionSchema = z
  .object({
    decision: z.enum(["proceed", "refine", "pivot"]),
    rationaleSummary: z.string().min(1),
    evidenceGaps: z.array(z.string().min(1)).default([]),
    nextAction: z.string().min(1),
    userConfirmationRequired: z.boolean().default(false),
    metadata: metadataSchema.optional(),
  })
  .strict();

const artifactBaseSchema = z.object({
  artifactId: z.string().min(1),
  visualId: z.string().min(1),
  title: z.string().min(1),
  caption: z.string().min(1),
  outputIntent: z.enum(["final_report_embed", "research_trail_preview", "audit_only"]),
  contentType: z.literal("image/png"),
  sourceIds: nonEmptyStringArraySchema,
  metricIds: z.array(z.string().min(1)).default([]),
  displayOrder: z.number().int().nonnegative().optional(),
  metadata: metadataSchema.optional(),
});

export const artifactManifestRecordSchema = z.discriminatedUnion("status", [
  artifactBaseSchema
    .extend({
      status: z.literal("passed"),
      url: z.string().url(),
      fileKey: z.string().min(1),
    })
    .strict(),
  artifactBaseSchema
    .extend({
      status: z.literal("failed"),
      reason: z.string().min(1),
    })
    .strict(),
  artifactBaseSchema
    .extend({
      status: z.literal("omitted"),
      reason: z.string().min(1),
    })
    .strict(),
]);

export const artifactManifestSchema = z
  .object({
    artifacts: z.array(artifactManifestRecordSchema),
    metadata: metadataSchema.optional(),
  })
  .strict();

export type ResearchPlan = z.infer<typeof researchPlanSchema>;
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;
export type EvidenceClaim = z.infer<typeof evidenceClaimSchema>;
export type VisualMetric = z.infer<typeof visualMetricSchema>;
export type EvidenceLedger = z.infer<typeof evidenceLedgerSchema>;
export type VisualDataReference = z.infer<typeof visualDataReferenceSchema>;
export type VisualSpec = z.infer<typeof visualSpecSchema>;
export type ResearchDecision = z.infer<typeof researchDecisionSchema>;
export type ArtifactManifestRecord = z.infer<typeof artifactManifestRecordSchema>;
export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;
