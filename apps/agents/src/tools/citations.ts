import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { extractCitations } from "../citations/bibliography";
import {
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

// verifyCitations (port of agent/research/citationTools.ts): extract the
// bibliography from an artifact, run the four-step integrity engine per
// reference, and report with neutral framing (a flag is not an accusation).

const VERIFY_CONCURRENCY = 4;

export function citationProvidersFor(ctx: RunToolContext): CitationProviders {
  return {
    lookupDoi: (doi) => lookupDoiProvider(ctx.providers, { doi }),
    searchArxiv: (query, limit) =>
      searchArxivProvider(ctx.providers, { query, limit }),
    searchOpenAlex: (query, limit) =>
      searchOpenAlexWorks(ctx.providers, { query, limit }),
  };
}

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

      const providers = citationProvidersFor(ctx);
      const items: Array<Record<string, unknown>> = [];
      for (let i = 0; i < citations.length; i += VERIFY_CONCURRENCY) {
        const chunk = citations.slice(i, i + VERIFY_CONCURRENCY);
        const settled = await Promise.all(
          chunk.map(async (citation) => {
            try {
              const result = await verifyOneCitation(providers, citation);
              return {
                reference: citation.title,
                doi: citation.doi,
                arxivId: citation.arxivId,
                status: result.status,
                issues: result.signals.metadataIssues,
                matchedTitle: result.matchedTitle,
              };
            } catch {
              return {
                reference: citation.title,
                status: "unverifiable" as const,
                issues: [] as string[],
              };
            }
          }),
        );
        items.push(...settled);
      }

      const verified = items.filter((item) => item.status === "verified").length;
      const flagged = items.filter((item) =>
        FLAGGED_INTEGRITY_STATUSES.has(
          item.status as Parameters<typeof FLAGGED_INTEGRITY_STATUSES.has>[0],
        ),
      ).length;

      await ctx.store.appendRunEvent({
        runId: ctx.runId,
        type: "citation_check",
        payload: { checked: items.length, verified, flagged },
      });

      return jsonResult({
        status: "completed",
        summary: { checked: items.length, verified, flagged },
        items,
        caveat:
          "A flag is not an accusation: it can stem from a metadata typo, an incomplete database, or a provider outage. Recommend manual verification for flagged items and use neutral language.",
      });
    },
    { annotations: { readOnlyHint: true } },
  );

  return [verifyCitations];
}
