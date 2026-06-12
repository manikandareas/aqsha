"use node";

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction, type ActionCtx } from "../../_generated/server";
import { embeddingProviderConfig } from "../providers/providers";
import { CONTEXT_BUDGET, clipText } from "./contextBudget";
import { artifactRag, artifactRagNamespace } from "./rag";

async function retrieveThreadDocumentContext(
  ctx: ActionCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    query: string;
    messageAttachmentArtifactIds?: Id<"artifacts">[];
    excludeArtifactIds?: Id<"artifacts">[];
  },
): Promise<string> {
  if (!embeddingProviderConfig.enabled || !args.query.trim()) {
    return "";
  }
  const [artifactTargets, workspaceTargets] = await Promise.all([
    ctx.runQuery(internal.agent.context.threadContext.listRagTargetsForThread, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      messageAttachmentArtifactIds: args.messageAttachmentArtifactIds,
    }),
    ctx.runQuery(
      internal.agent.context.threadContextWorkspaces.listWorkspaceRagTargetsForThread,
      {
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
      },
    ),
  ]);
  // AUD-17: drop artifacts whose full content is already in the prompt block —
  // retrieving their chunks would duplicate the same text. Workspace filters are
  // untouched (whole workspaces are never full-stuffed into the prompt).
  const excluded = new Set<string>(args.excludeArtifactIds ?? []);
  const includedArtifactTargets = excluded.size
    ? artifactTargets.filter((target) => !excluded.has(target.artifactId))
    : artifactTargets;
  if (includedArtifactTargets.length === 0 && workspaceTargets.length === 0) {
    return "";
  }

  // Paper chips filter by artifactId; whole-workspace chips filter by
  // workspaceId. The RAG search ORs all filter entries, so this retrieves
  // chunks belonging to any pinned paper or any referenced workspace. Whole
  // workspaces are retrieved (never full-stuffed) and bounded by RAG_CONTEXT_LIMIT.
  const filters = [
    ...includedArtifactTargets.map((target) => ({
      name: "artifactId" as const,
      value: target.artifactId,
    })),
    ...workspaceTargets.map((target) => ({
      name: "workspaceId" as const,
      value: target.workspaceId,
    })),
  ];

  try {
    const search = await artifactRag.search(ctx, {
      namespace: artifactRagNamespace(args.ownerUserId),
      query: args.query,
      filters,
      limit: Math.min(
        12,
        Math.max(3, artifactTargets.length * 2 + workspaceTargets.length * 4),
      ),
      chunkContext: { before: 1, after: 1 },
      vectorScoreThreshold: 0.35,
    });
    const text = clipText(search.text, CONTEXT_BUDGET.ragTotalChars).text;
    if (!text) {
      return "";
    }
    return [
      "<retrieved_document_context>",
      "These excerpts were retrieved semantically from the user's uploaded and selected thread documents. Use them when relevant and prefer them over weaker guesses.",
      "",
      text,
      "</retrieved_document_context>",
    ].join("\n");
  } catch (error) {
    console.warn("Failed to retrieve RAG context", error);
    return "";
  }
}

export const buildRagContextForThread = internalAction({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    query: v.string(),
    messageAttachmentArtifactIds: v.optional(v.array(v.id("artifacts"))),
    excludeArtifactIds: v.optional(v.array(v.id("artifacts"))),
  },
  handler: async (ctx, args): Promise<string> => {
    return await retrieveThreadDocumentContext(ctx, args);
  },
});

export const searchThreadDocuments = internalAction({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    query: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    return await retrieveThreadDocumentContext(ctx, args);
  },
});
