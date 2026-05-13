import { v } from "convex/values";

export type EvidenceStrength = "strong" | "medium" | "weak";
export type SourceOrigin = "web" | "arxiv" | "doi";

export type SourceCandidate = {
  citationNumber: number;
  origin: SourceOrigin;
  provider?: string;
  providerRequestId?: string;
  evidenceStrength: EvidenceStrength;
  title: string;
  locator: string;
  url?: string;
  doi?: string;
  arxivId?: string;
  snippet: string;
  readStatus?: "not_needed" | "ready" | "failed";
  readError?: string;
  rerankScore?: number;
  metadataJson?: string;
};

export const sourceCandidateValidator = v.object({
  citationNumber: v.number(),
  origin: v.union(
    v.literal("web"),
    v.literal("arxiv"),
    v.literal("doi"),
  ),
  provider: v.optional(v.string()),
  providerRequestId: v.optional(v.string()),
  evidenceStrength: v.union(
    v.literal("strong"),
    v.literal("medium"),
    v.literal("weak"),
  ),
  title: v.string(),
  locator: v.string(),
  url: v.optional(v.string()),
  doi: v.optional(v.string()),
  arxivId: v.optional(v.string()),
  snippet: v.string(),
  readStatus: v.optional(
    v.union(v.literal("not_needed"), v.literal("ready"), v.literal("failed")),
  ),
  readError: v.optional(v.string()),
  rerankScore: v.optional(v.number()),
  metadataJson: v.optional(v.string()),
});

export function trimForSnippet(value: string | null | undefined, max = 700) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 3)}...`;
}
