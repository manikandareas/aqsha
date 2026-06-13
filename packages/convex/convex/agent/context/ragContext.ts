"use node";

import { v } from "convex/values";
import { internal } from "../../_generated/api";
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
  },
): Promise<string> {
  if (!embeddingProviderConfig.enabled || !args.query.trim()) {
    return "";
  }
  // Targets are the thread's uploaded documents (workspace-scoped pinned context
  // was retired in the legacy cleanup; the agent routes context per-turn).
  const artifactTargets = await ctx.runQuery(
    internal.agent.context.threadContext.listRagTargetsForThread,
    {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
    },
  );
  if (artifactTargets.length === 0) {
    return "";
  }

  const filters = artifactTargets.map((target) => ({
    name: "artifactId" as const,
    value: target.artifactId,
  }));

  try {
    const search = await artifactRag.search(ctx, {
      namespace: artifactRagNamespace(args.ownerUserId),
      query: args.query,
      filters,
      limit: Math.min(12, Math.max(3, artifactTargets.length * 2)),
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
