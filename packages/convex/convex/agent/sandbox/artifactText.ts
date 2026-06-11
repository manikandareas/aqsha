import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction, type ActionCtx } from "../../_generated/server";

// Shared "full plain text for an artifact" resolver for the sandbox compute path,
// used by both the verifyStatistics/runComputation tools and the long-job
// workflow's hydrate step. Resolves the indexed plain text (inline or oversized
// storage) for workspace documents (markdown / uploaded PDF / docx) and URL
// artifacts. Never reads a raw PDF binary as text — only the extracted text.

export async function resolveArtifactPlainText(
  ctx: ActionCtx,
  ownerUserId: string,
  artifactId: Id<"artifacts">,
): Promise<string> {
  const target = await ctx.runQuery(internal.artifacts.getContentTarget, {
    ownerUserId,
    artifactId,
  });
  if (!target) return "";
  const { content, url } = target;
  if (content?.plainText && content.plainText.trim()) {
    return content.plainText;
  }
  if (content?.storageId) {
    const blob = await ctx.storage.get(content.storageId);
    if (blob) return await blob.text();
  }
  if (url?.readableText && url.readableText.trim()) {
    return url.readableText;
  }
  if (url?.storageId) {
    const blob = await ctx.storage.get(url.storageId);
    if (blob) return await blob.text();
  }
  return "";
}

// Hydrate step for the long-job workflow: resolves artifact text in its own
// retryable action so the workflow is self-contained from an artifactId.
export const resolveArtifactTextAction = internalAction({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    return await resolveArtifactPlainText(ctx, args.ownerUserId, args.artifactId);
  },
});
