"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { embeddingProviderConfig } from "./providers";
import { artifactRag, artifactRagNamespace } from "./rag";

const RAG_CONTEXT_LIMIT = 6_000;

export const buildRagContextForThread = internalAction({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    query: v.string(),
    messageAttachmentArtifactIds: v.optional(v.array(v.id("artifacts"))),
  },
  handler: async (ctx, args): Promise<string> => {
    if (!embeddingProviderConfig.enabled || !args.query.trim()) {
      return "";
    }
    const targets: Array<{
      artifactId: string;
      workspaceId?: string;
      title: string;
      ragEntryId?: string;
    }> = await ctx.runQuery(internal.agent.threadContext.listRagTargetsForThread, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      messageAttachmentArtifactIds: args.messageAttachmentArtifactIds,
    });
    if (targets.length === 0) {
      return "";
    }

    try {
      const search = await artifactRag.search(ctx, {
        namespace: artifactRagNamespace(args.ownerUserId),
        query: args.query,
        filters: targets.map((target) => ({
          name: "artifactId" as const,
          value: target.artifactId,
        })),
        limit: Math.min(8, Math.max(3, targets.length * 2)),
        chunkContext: { before: 1, after: 1 },
        vectorScoreThreshold: 0.35,
      });
      const text = clipText(search.text, RAG_CONTEXT_LIMIT);
      if (!text) {
        return "";
      }
      return [
        "<retrieved_document_context>",
        "These excerpts were retrieved semantically from the user's selected uploaded documents. Use them when relevant and prefer them over weaker guesses.",
        "",
        text,
        "</retrieved_document_context>",
      ].join("\n");
    } catch (error) {
      console.warn("Failed to retrieve RAG context", error);
      return "";
    }
  },
});

function clipText(value: string, limit: number) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}
