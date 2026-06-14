import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { extractCitations, MAX_CITATIONS } from "../citations/bibliography";
import {
  type CitationInput,
  FLAGGED_INTEGRITY_STATUSES,
  verifyOneCitation,
  type CitationProviders,
} from "../citations/integrity";
import {
  lookupDoiProvider,
  searchArxivProvider,
  searchOpenAlexWorks,
} from "../providers";
import { errorResult, jsonResult, type RunToolContext } from "./context";

// Citation integrity tools (port of agent/research/citationTools.ts). Two
// entrypoints share the same four-step engine, reported with neutral framing
// (a flag is not an accusation):
//   - verifyCitations: extracts the bibliography from a FINISHED artifact.
//   - verifyIdentifiers: verifies a CALLER-SUPPLIED reference list, so the deep
//     citation_verify phase can run before any artifact exists (plan §4.2).

const VERIFY_CONCURRENCY = 4;

const NEUTRAL_CAVEAT =
  "A flag is not an accusation: it can stem from a metadata typo, an incomplete database, or a provider outage. Recommend manual verification for flagged items and use neutral language.";

/** A reference to verify; `citation` is the [n] number, echoed back unchanged. */
type CitationVerifyRef = CitationInput & { citation?: number };

export function citationProvidersFor(ctx: RunToolContext): CitationProviders {
  return {
    lookupDoi: (doi) => lookupDoiProvider(ctx.providers, { doi }),
    searchArxiv: (query, limit) =>
      searchArxivProvider(ctx.providers, { query, limit }),
    searchOpenAlex: (query, limit) =>
      searchOpenAlexWorks(ctx.providers, { query, limit }),
  };
}

/** Run the four-step engine over a reference list, batched by concurrency. */
async function runVerificationBatch(
  providers: CitationProviders,
  refs: CitationVerifyRef[],
): Promise<Array<Record<string, unknown>>> {
  const items: Array<Record<string, unknown>> = [];
  for (let i = 0; i < refs.length; i += VERIFY_CONCURRENCY) {
    const chunk = refs.slice(i, i + VERIFY_CONCURRENCY);
    const settled = await Promise.all(
      chunk.map(async (ref) => {
        try {
          const result = await verifyOneCitation(providers, ref);
          return {
            reference: ref.title,
            citation: ref.citation,
            doi: ref.doi,
            arxivId: ref.arxivId,
            status: result.status,
            issues: result.signals.metadataIssues,
            matchedTitle: result.matchedTitle,
          };
        } catch {
          return {
            reference: ref.title,
            citation: ref.citation,
            status: "unverifiable" as const,
            issues: [] as string[],
          };
        }
      }),
    );
    items.push(...settled);
  }
  return items;
}

/** Roll the per-reference verdicts up into a checked/verified/flagged count. */
function tally(items: Array<Record<string, unknown>>): {
  checked: number;
  verified: number;
  flagged: number;
} {
  const verified = items.filter((item) => item.status === "verified").length;
  const flagged = items.filter((item) =>
    FLAGGED_INTEGRITY_STATUSES.has(
      item.status as Parameters<typeof FLAGGED_INTEGRITY_STATUSES.has>[0],
    ),
  ).length;
  return { checked: items.length, verified, flagged };
}

const VerifyItem = z.object({
  title: z.string().min(1),
  doi: z.string().optional(),
  arxivId: z.string().optional(),
  authors: z.array(z.string()).optional(),
  year: z.number().optional(),
  venue: z.string().optional(),
  citation: z.number().optional(),
});

export function buildCitationTools(ctx: RunToolContext) {
  const verifyCitations = tool(
    "verifyCitations",
    "Verify a document's bibliography: existence, metadata consistency, and DOI/arXiv identifier validity per reference. Pass the artifactId of the paper in context.",
    { artifactId: z.string().min(1) },
    async (args) => {
      const artifact = await ctx.store.getArtifact(args.artifactId);
      if (!artifact) {
        return errorResult(`Artifact ${args.artifactId} was not found.`);
      }
      const citations = extractCitations(artifact.text);
      if (citations.length === 0) {
        return jsonResult({
          status: "completed",
          summary: { checked: 0, verified: 0, flagged: 0 },
          note: "No parseable references section was found in this document.",
        });
      }

      const items = await runVerificationBatch(citationProvidersFor(ctx), citations);
      const summary = tally(items);
      await ctx.store.appendRunEvent({
        runId: ctx.runId,
        type: "citation_check",
        payload: summary,
      });

      return jsonResult({ status: "completed", summary, items, caveat: NEUTRAL_CAVEAT });
    },
    { annotations: { readOnlyHint: true } },
  );

  const verifyIdentifiers = tool(
    "verifyIdentifiers",
    "Verify a list of collected references (existence, metadata consistency, DOI/arXiv validity) WITHOUT a finished document. Call once with the whole list; pass each reference's [n] citation number to get verdicts keyed by it back. Use this during research before any artifact exists.",
    { references: z.array(VerifyItem).min(1).max(MAX_CITATIONS) },
    async (args) => {
      const items = await runVerificationBatch(citationProvidersFor(ctx), args.references);
      const summary = tally(items);
      await ctx.store.appendRunEvent({
        runId: ctx.runId,
        type: "citation_check",
        payload: summary,
      });

      return jsonResult({ status: "completed", summary, items, caveat: NEUTRAL_CAVEAT });
    },
    { annotations: { readOnlyHint: true } },
  );

  return [verifyCitations, verifyIdentifiers];
}
