import { z } from "zod";

// Source-candidate contract shared by the research tools, citation engine, and
// (later) run-progress UI. Port of agent/research/sourceCandidates.ts with zod
// instead of convex/values so it is usable outside the Convex runtime.

export const evidenceStrengthSchema = z.enum(["strong", "medium", "weak"]);
export type EvidenceStrength = z.infer<typeof evidenceStrengthSchema>;

export const sourceOriginSchema = z.enum(["web", "arxiv", "doi"]);
export type SourceOrigin = z.infer<typeof sourceOriginSchema>;

export const sourceUsageSchema = z.enum([
  "candidate",
  "cited",
  "accepted",
  "rejected",
]);
export type SourceUsage = z.infer<typeof sourceUsageSchema>;

export const sourceCandidateSchema = z.object({
  citationNumber: z.number().int().positive(),
  sourceKey: z.string().optional(),
  usage: sourceUsageSchema.optional(),
  origin: sourceOriginSchema,
  provider: z.string().optional(),
  providerRequestId: z.string().optional(),
  evidenceStrength: evidenceStrengthSchema,
  title: z.string(),
  locator: z.string(),
  url: z.string().optional(),
  doi: z.string().optional(),
  arxivId: z.string().optional(),
  snippet: z.string(),
  readStatus: z.enum(["not_needed", "ready", "failed"]).optional(),
  readError: z.string().optional(),
  qualityReason: z.string().optional(),
  bucketName: z.string().optional(),
  discoveryQuery: z.string().optional(),
  rerankScore: z.number().optional(),
  metadataJson: z.string().optional(),
});
export type SourceCandidate = z.infer<typeof sourceCandidateSchema>;

// A provider result before the per-turn citation counter assigns its number.
export type ExternalCandidate = Omit<SourceCandidate, "citationNumber">;

export const integrityStatusSchema = z.enum([
  "verified",
  "metadata_mismatch",
  "identifier_invalid",
  "not_found",
  "unverifiable",
]);
export type IntegrityStatus = z.infer<typeof integrityStatusSchema>;
