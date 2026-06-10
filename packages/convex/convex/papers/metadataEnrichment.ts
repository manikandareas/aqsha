import { v } from "convex/values";
import { z } from "zod";
import { generateObject } from "ai";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { chatProvider, chatProviderConfig } from "../agent/providers/providers";
import { CHAT_LITE_MODEL } from "../agent/models";
import { resolvePaper } from "./ingest/resolve";
import { normalizeDoi } from "./ingest/identifiers";
import {
  classifyPaperText,
  isUsablePaperMetadata,
  normalizeLlmPaperMetadata,
} from "./ingest/uploadIdentifiers";

// Only the first pages carry the header (title/authors/abstract/DOI); cap the
// text we resolve identifiers from and feed the LLM so the request stays cheap.
const MAX_ENRICHMENT_TEXT_CHARS = 8000;

// Conservative confidence stamped on LLM-derived metadata (vs. GROBID/Crossref).
const LLM_METADATA_CONFIDENCE = 0.4;

// Authoritative resolver metadata (Crossref/OpenAlex/arXiv/DataCite/S2). Stamped
// so the sidebar's confidence row is consistent across sources instead of only
// labelling the weaker LLM guess.
const RESOLVER_METADATA_CONFIDENCE = 0.95;

/**
 * LLM bibliographic fallback is on whenever a chat provider is configured.
 * Mirrors `isGrobidEnabled()` so it can be force-disabled with
 * `LLM_METADATA_ENABLED=false` without unsetting the chat key.
 */
export function isLlmMetadataEnabled(): boolean {
  return process.env.LLM_METADATA_ENABLED !== "false" && chatProviderConfig.enabled;
}

const llmPaperSchema = z.object({
  isResearchPaper: z
    .boolean()
    .describe(
      "true only if this document is an academic/research paper (has a title, authors, and abstract or scholarly structure). false for slides, reports, forms, invoices, books, or other non-papers.",
    ),
  title: z.string().max(500).optional().describe("The paper's title, verbatim."),
  abstract: z
    .string()
    .max(4000)
    .optional()
    .describe("The abstract, verbatim, in the document's own language. Omit if absent."),
  doi: z.string().max(200).optional().describe("DOI if printed on the page, else omit."),
  authors: z
    .array(z.string().max(200))
    .max(60)
    .optional()
    .describe("Author full names in order, without affiliations or superscripts."),
  journal: z
    .string()
    .max(300)
    .optional()
    .describe("Journal, conference, or venue name if stated."),
  publishedYear: z.number().int().optional().describe("Publication year if stated."),
});

/**
 * Enrich an uploaded PDF's paper metadata WITHOUT depending on GROBID.
 *
 * 1. Identifier-first: pull a DOI/arXiv id from the first pages and resolve
 *    authoritative metadata via the shared `resolvePaper` (Crossref / OpenAlex /
 *    arXiv / DataCite / Semantic Scholar) — clean data that never relies on
 *    fragile PDF parsing.
 * 2. LLM fallback: for papers with no identifier, extract header fields with a
 *    structured-output model over the first pages.
 *
 * Either path also marks the artifact `scholarly_paper` so the UI surfaces it.
 * Runs async (scheduled from the upload pipeline) and is best-effort: a failure
 * here never blocks indexing, and GROBID may later upgrade the same row.
 */
export const enrichUploadedPaperMetadata = internalAction({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    text: v.string(),
  },
  returns: v.object({
    ok: v.boolean(),
    source: v.optional(v.union(v.literal("resolver"), v.literal("llm"))),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const text = args.text.slice(0, MAX_ENRICHMENT_TEXT_CHARS);

    // 1) Identifier-first resolution.
    const classified = classifyPaperText(text);
    if (classified) {
      const resolved = await resolvePaper(ctx, { classified });
      if (
        resolved &&
        isUsablePaperMetadata({
          title: resolved.title,
          abstract: resolved.abstract,
          authorCount: resolved.authors.length,
        })
      ) {
        const written = await ctx.runMutation(
          internal.papers.extractions.upsertResolvedPaperMetadata,
          {
            ownerUserId: args.ownerUserId,
            artifactId: args.artifactId,
            metadataSource: resolved.metadataSource,
            title: resolved.title,
            abstract: resolved.abstract,
            doi: resolved.doi,
            arxivId: resolved.arxivId,
            authors: resolved.authors,
            affiliations: resolved.affiliations,
            journal: resolved.journal,
            publisher: resolved.publisher,
            publishedYear: resolved.publishedYear,
            sourceUrl: resolved.landingPageUrl,
            oaStatus: resolved.oaStatus,
            confidence: RESOLVER_METADATA_CONFIDENCE,
          },
        );
        if (written.ok) {
          await markScholarly(ctx, args);
          return { ok: true, source: "resolver" as const };
        }
      }
    }

    // 2) LLM fallback.
    if (!isLlmMetadataEnabled() || !text.trim()) {
      return { ok: false, reason: "no_identifier" };
    }

    let raw: z.infer<typeof llmPaperSchema>;
    try {
      const result = await generateObject({
        model: chatProvider.chat(CHAT_LITE_MODEL),
        // Headroom for a full abstract (~4k chars) plus the other fields so the
        // structured JSON never truncates mid-object and fails to parse.
        maxOutputTokens: 2000,
        schema: llmPaperSchema,
        system:
          "You extract bibliographic metadata from the first pages of an uploaded document. " +
          "Copy fields verbatim in the document's own language; never translate or invent. " +
          "If a field is not clearly present, omit it.",
        prompt: `First pages of an uploaded document:\n\n${text}`,
      });
      raw = result.object;
    } catch {
      return { ok: false, reason: "llm_error" };
    }

    if (!raw.isResearchPaper) {
      return { ok: false, reason: "not_a_paper" };
    }

    const normalized = normalizeLlmPaperMetadata({
      title: raw.title,
      abstract: raw.abstract,
      doi: raw.doi ? normalizeDoi(raw.doi) : undefined,
      authors: raw.authors,
      journal: raw.journal,
      publishedYear: raw.publishedYear,
    });
    if (
      !isUsablePaperMetadata({
        title: normalized.title,
        abstract: normalized.abstract,
        authorCount: normalized.authors.length,
      })
    ) {
      return { ok: false, reason: "llm_no_signal" };
    }

    const written = await ctx.runMutation(
      internal.papers.extractions.upsertResolvedPaperMetadata,
      {
        ownerUserId: args.ownerUserId,
        artifactId: args.artifactId,
        metadataSource: "llm",
        title: normalized.title,
        abstract: normalized.abstract,
        doi: normalized.doi,
        authors: normalized.authors.map((name) => ({ name })),
        journal: normalized.journal,
        publishedYear: normalized.publishedYear,
        confidence: LLM_METADATA_CONFIDENCE,
      },
    );
    if (!written.ok) {
      return { ok: false, reason: "not_written" };
    }
    await markScholarly(ctx, args);
    return { ok: true, source: "llm" as const };
  },
});

async function markScholarly(
  ctx: ActionCtx,
  args: { ownerUserId: string; artifactId: Id<"artifacts"> },
) {
  await ctx.runMutation(internal.papers.extractions.setArtifactDetectedKind, {
    ownerUserId: args.ownerUserId,
    artifactId: args.artifactId,
    detectedDocumentKind: "scholarly_paper",
  });
}
