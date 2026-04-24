import { z } from "zod";

export const evidenceItemSchema = z.object({
  citationKey: z.string().min(1),
  title: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  quote: z.string().min(1),
  source: z.enum(["qdrant", "websets", "manual"]).default("manual"),
});

export const claimSchema = z.object({
  text: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  supported: z.boolean(),
  citationKeys: z.array(z.string()).default([]),
});

export const planSchema = z.object({
  researchQuestions: z.array(z.string()).min(1),
  searchQueries: z.array(z.string()).default([]),
  requiredEvidence: z.array(z.string()).default([]),
});

export const researchSchema = z.object({
  evidenceItems: z.array(evidenceItemSchema).default([]),
  claims: z.array(claimSchema).default([]),
  gaps: z.array(z.string()).default([]),
});

export const criticSchema = z.object({
  sufficient: z.boolean(),
  missingEvidence: z.array(z.string()).default([]),
  nextQueries: z.array(z.string()).default([]),
});

export const synthesisSchema = z.object({
  answer: z.string().min(1),
  claims: z.array(claimSchema).default([]),
  evidenceItems: z.array(evidenceItemSchema).default([]),
});

export const citationAuditSchema = z.object({
  passed: z.boolean(),
  warnings: z.array(z.string()).default([]),
  failures: z.array(z.string()).default([]),
  supportedClaimCount: z.number().int().nonnegative(),
});

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
