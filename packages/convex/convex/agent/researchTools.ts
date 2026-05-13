import { createTool } from "@convex-dev/agent";
import type { ToolSet } from "ai";
import { z } from "zod";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  lookupDoiProvider,
  jinaSearchWeb,
  searchWebProvider,
  searchArxivProvider,
} from "./externalProviders";
import type { SourceCandidate } from "./sourceCandidates";

type AqshaToolCtx = ActionCtx & {
  userId?: string;
  threadId?: string;
  messageId?: string;
  runId?: Id<"agentRuns">;
};

const querySchema = z.object({
  query: z.string().min(1).max(500).describe("Search query"),
  limit: z.number().int().min(1).max(5).optional().describe("Maximum results"),
});

const artifactContentSchema = z.object({
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(200_000),
  contentFormat: z
    .enum(["markdown", "html", "plain", "code", "json"])
    .default("markdown"),
  type: z
    .enum(["document", "code", "html", "json", "plain_text", "markdown_report"])
    .default("document"),
  changeSummary: z.string().max(500).optional(),
});

const updateArtifactSchema = artifactContentSchema.extend({
  artifactId: z
    .string()
    .min(1)
    .describe(
      "Exact existing Convex artifact id from an artifact card/tool result. Do not use a title or slug.",
    ),
});

type ArtifactToolResult = {
  artifactId: Id<"artifacts">;
  versionId: Id<"artifactVersions">;
  relation: "created" | "updated";
  title: string;
};

type ArtifactToolFailure = {
  ok: false;
  reason: "invalid_artifact_id";
  message: string;
};

export const researchTools: ToolSet = {
  searchWeb: createTool<typeof querySchema._output, SourceCandidate[], AqshaToolCtx>({
    description:
      "Search the public web through Exa with Jina Search fallback for current or broad context when corpus and academic sources are not enough.",
    inputSchema: querySchema,
    execute: async (ctx, input): Promise<SourceCandidate[]> => {
      const ownerUserId = requireToolUser(ctx);
      const exaResults = await searchWebProvider(ctx, {
        ownerUserId,
        query: input.query,
        limit: input.limit,
      });
      if (hasUsableResults(exaResults)) {
        return numberCandidates(exaResults, 61);
      }
      const jinaResults = await jinaSearchWeb(ctx, {
        ownerUserId,
        query: input.query,
        limit: input.limit,
      });
      return numberCandidates(jinaResults, 61);
    },
  }),
  searchArxiv: createTool<typeof querySchema._output, SourceCandidate[], AqshaToolCtx>({
    description:
      "Search arXiv for academic preprints, especially computer science, math, physics, statistics, and quantitative research.",
    inputSchema: querySchema,
    execute: async (ctx, input): Promise<SourceCandidate[]> => {
      const results = await searchArxivProvider(ctx, {
        ownerUserId: requireToolUser(ctx),
        query: input.query,
        limit: input.limit,
      });
      return numberCandidates(results, 21);
    },
  }),
  lookupDoi: createTool<
    { doi: string },
    SourceCandidate[],
    AqshaToolCtx
  >({
    description:
      "Look up Crossref metadata for a DOI. Use when the user provides a DOI or a cited paper needs DOI metadata.",
    inputSchema: z.object({
      doi: z.string().min(1).max(200).describe("DOI or doi.org URL"),
    }),
    execute: async (ctx, input): Promise<SourceCandidate[]> => {
      const results = await lookupDoiProvider(ctx, {
        ownerUserId: requireToolUser(ctx),
        doi: input.doi,
      });
      return numberCandidates(results, 41);
    },
  }),
  createArtifact: createTool<
    typeof artifactContentSchema._output,
    ArtifactToolResult,
    AqshaToolCtx
  >({
    description:
      "Create a standalone chat artifact when the response is substantial, reusable, report-like, code-like, or likely to need iteration. Return a short chat summary separately instead of duplicating the full artifact body.",
    inputSchema: artifactContentSchema,
    execute: async (ctx, input): Promise<ArtifactToolResult> => {
      const ownerUserId = requireToolUser(ctx);
      const threadId = requireToolThread(ctx);
      const result = await ctx.runMutation(
        internal.agent.artifacts.createVersionFromAgent,
        {
          ownerUserId,
          threadId,
          runId: ctx.runId,
          type: input.type,
          title: input.title,
          contentFormat: input.contentFormat,
          body: input.body,
          changeSummary: input.changeSummary,
        },
      );
      return {
        ...result,
        relation: "created",
        title: input.title,
      };
    },
  }),
  updateArtifact: createTool<
    typeof updateArtifactSchema._output,
    ArtifactToolResult | ArtifactToolFailure,
    AqshaToolCtx
  >({
    description:
      "Create a new immutable version for an existing artifact when the user asks to revise, extend, or refine it. Only call this when you have the exact artifact id from a prior artifact card or tool result; if you only know a title/slug, create a new artifact instead.",
    inputSchema: updateArtifactSchema,
    execute: async (ctx, input): Promise<ArtifactToolResult | ArtifactToolFailure> => {
      const ownerUserId = requireToolUser(ctx);
      if (!isLikelyConvexId(input.artifactId)) {
        return {
          ok: false,
          reason: "invalid_artifact_id",
          message:
            "artifactId must be the exact Convex artifact id, not a title or slug. Create a new artifact instead unless the exact id is available.",
        };
      }
      const result = await ctx.runMutation(
        internal.agent.artifacts.updateVersionFromAgent,
        {
          ownerUserId,
          artifactId: input.artifactId as Id<"artifacts">,
          runId: ctx.runId,
          title: input.title,
          contentFormat: input.contentFormat,
          body: input.body,
          changeSummary: input.changeSummary,
        },
      );
      return {
        ...result,
        relation: "updated",
        title: input.title,
      };
    },
  }),
};

function numberCandidates(
  candidates: Array<Omit<SourceCandidate, "citationNumber">>,
  start: number,
): SourceCandidate[] {
  return candidates.slice(0, 5).map((candidate, index) => ({
    ...candidate,
    citationNumber: start + index,
  }));
}

function hasUsableResults(candidates: Array<Omit<SourceCandidate, "citationNumber">>) {
  return candidates.some(
    (candidate) =>
      candidate.evidenceStrength !== "weak" &&
      candidate.title.trim().length > 0 &&
      candidate.snippet.trim().length > 0,
  );
}

function requireToolUser(ctx: AqshaToolCtx) {
  if (!ctx.userId) {
    throw new Error("Tool call is missing user context");
  }
  return ctx.userId;
}

function requireToolThread(ctx: AqshaToolCtx) {
  if (!ctx.threadId) {
    throw new Error("Tool call is missing thread context");
  }
  return ctx.threadId;
}

function isLikelyConvexId(value: string) {
  return /^[a-z0-9]{24,40}$/.test(value);
}
