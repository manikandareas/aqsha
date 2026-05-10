import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export type EvidenceStrength = "strong" | "medium" | "weak";
export type SourceOrigin = "corpus" | "web" | "arxiv" | "doi";

export type SourceCandidate = {
  citationNumber: number;
  origin: SourceOrigin;
  evidenceStrength: EvidenceStrength;
  title: string;
  locator: string;
  url?: string;
  doi?: string;
  arxivId?: string;
  snippet: string;
  corpusSourceId?: Id<"corpusSources">;
};

export const sourceCandidateValidator = v.object({
  citationNumber: v.number(),
  origin: v.union(
    v.literal("corpus"),
    v.literal("web"),
    v.literal("arxiv"),
    v.literal("doi"),
  ),
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
  corpusSourceId: v.optional(v.id("corpusSources")),
});

export function trimForSnippet(value: string | null | undefined, max = 700) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 3)}...`;
}
