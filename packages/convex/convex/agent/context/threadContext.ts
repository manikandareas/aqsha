import { v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server";
import { artifactTypeForLegacyArtifact } from "../../artifacts/model";
import { CONTEXT_BUDGET } from "./contextBudget";

type ThreadContextCtx = QueryCtx | MutationCtx;

type ContextArtifactTarget = {
  artifact: Doc<"artifacts">;
  source: "message_attachment" | "thread_upload";
};

async function getThreadOwner(ctx: ThreadContextCtx, threadId: string) {
  // Reads the first-party chatThreads table (the @convex-dev/agent component is
  // unmounted after the Step 6 cutover).
  const thread = await ctx.db
    .query("chatThreads")
    .withIndex("by_thread_id", (q) => q.eq("threadId", threadId))
    .unique();
  return thread?.ownerUserId ?? null;
}

export async function isOwnedThread(ctx: ThreadContextCtx, args: {
  threadId: string;
  ownerUserId: string;
}) {
  const ownerUserId = await getThreadOwner(ctx, args.threadId);
  return ownerUserId === args.ownerUserId;
}

async function listThreadDocumentArtifacts(ctx: ThreadContextCtx, args: {
  ownerUserId: string;
  threadId: string;
}) {
  const artifacts = await ctx.db
    .query("artifacts")
    .withIndex("by_owner_thread_source_status_created", (q) =>
      q
        .eq("ownerUserId", args.ownerUserId)
        .eq("threadId", args.threadId)
        .eq("source", "upload")
        .eq("status", "active"),
    )
    .order("desc")
    .take(CONTEXT_BUDGET.threadDocumentScan);

  return artifacts.filter((artifact) => {
    const artifactType = artifactTypeForLegacyArtifact(artifact);
    return artifactType !== "url";
  });
}

async function getContextArtifactTargetById(
  ctx: ThreadContextCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    artifactId: Id<"artifacts">;
    source: ContextArtifactTarget["source"];
  },
): Promise<ContextArtifactTarget | null> {
  const artifact = await ctx.db.get("artifacts", args.artifactId);
  if (
    !artifact ||
    artifact.ownerUserId !== args.ownerUserId ||
    artifact.status !== "active"
  ) {
    return null;
  }
  // Workspace artifacts are available regardless of which workspace they belong
  // to (cross-workspace context is allowed); thread-only uploads must match the
  // thread they were uploaded to.
  if (!artifact.workspaceId && artifact.threadId !== args.threadId) {
    return null;
  }
  return { artifact, source: args.source };
}

// RAG targets are derived purely from live `artifacts` rows: any message
// attachments passed in plus the thread's own uploaded documents. (Pinned
// per-thread context — the retired threadContextArtifacts table — is gone; the agent
// sends context per-turn via the dispatch payload.)
async function listContextArtifactTargets(
  ctx: ThreadContextCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    messageAttachmentArtifactIds?: Id<"artifacts">[];
  },
) {
  const seen = new Set<string>();
  const targets: ContextArtifactTarget[] = [];

  const appendById = async (
    artifactId: Id<"artifacts">,
    source: ContextArtifactTarget["source"],
  ) => {
    const key = String(artifactId);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const target = await getContextArtifactTargetById(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      artifactId,
      source,
    });
    if (target) {
      targets.push(target);
    }
  };

  for (const artifactId of args.messageAttachmentArtifactIds ?? []) {
    await appendById(artifactId, "message_attachment");
  }
  const remainingThreadUploadSlots = Math.max(0, CONTEXT_BUDGET.threadDocuments);
  if (remainingThreadUploadSlots > 0) {
    let threadUploadCount = 0;
    for (const artifact of await listThreadDocumentArtifacts(ctx, args)) {
      if (threadUploadCount >= remainingThreadUploadSlots) {
        break;
      }
      const beforeCount = targets.length;
      await appendById(artifact._id, "thread_upload");
      if (targets.length > beforeCount) {
        threadUploadCount += 1;
      }
    }
  }

  return targets;
}

export const listRagTargetsForThread = internalQuery({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    messageAttachmentArtifactIds: v.optional(v.array(v.id("artifacts"))),
  },
  returns: v.array(v.object({
    artifactId: v.id("artifacts"),
    workspaceId: v.optional(v.id("workspaces")),
    title: v.string(),
    ragEntryId: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    if (!(await isOwnedThread(ctx, args))) {
      return [];
    }
    const contextTargets = await listContextArtifactTargets(ctx, args);
    const targets = [];

    for (const { artifact } of contextTargets) {
      const artifactType = artifactTypeForLegacyArtifact(artifact);
      if (
        artifactType !== "url" &&
        artifact.ragEntryId &&
        artifact.indexingStatus === "ready"
      ) {
        targets.push({
          artifactId: artifact._id,
          workspaceId: artifact.workspaceId,
          title: artifact.title,
          ragEntryId: artifact.ragEntryId,
        });
      }
    }

    return targets;
  },
});
