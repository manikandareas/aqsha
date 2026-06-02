import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export function shouldKeepThreadContextAfterWorkspaceMove(args: {
  threadWorkspaceId?: Id<"workspaces">;
  targetWorkspaceId: Id<"workspaces">;
}) {
  return !args.threadWorkspaceId || args.threadWorkspaceId === args.targetWorkspaceId;
}

export async function syncArtifactWorkspaceMove(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    artifactId: Id<"artifacts">;
    previousWorkspaceId: Id<"workspaces">;
    targetWorkspaceId: Id<"workspaces">;
    updatedAt: number;
  },
) {
  await patchArtifactWorkspaceRows(ctx, {
    ownerUserId: args.ownerUserId,
    artifactId: args.artifactId,
    workspaceId: args.targetWorkspaceId,
    updatedAt: args.updatedAt,
  });
  await syncThreadContextRowsAfterArtifactWorkspaceMove(ctx, args);
}

async function patchArtifactWorkspaceRows(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    artifactId: Id<"artifacts">;
    workspaceId: Id<"workspaces">;
    updatedAt: number;
  },
) {
  const document = await ctx.db
    .query("artifactContents")
    .withIndex("by_owner_artifact", (q) =>
      q.eq("ownerUserId", args.ownerUserId).eq("artifactId", args.artifactId),
    )
    .unique();
  if (document) {
    await ctx.db.patch("artifactContents", document._id, {
      workspaceId: args.workspaceId,
      updatedAt: args.updatedAt,
    });
  }

  const url = await ctx.db
    .query("artifactUrls")
    .withIndex("by_owner_artifact", (q) =>
      q.eq("ownerUserId", args.ownerUserId).eq("artifactId", args.artifactId),
    )
    .unique();
  if (url) {
    await ctx.db.patch("artifactUrls", url._id, {
      workspaceId: args.workspaceId,
      updatedAt: args.updatedAt,
    });
  }

  const paperMetadata = await ctx.db
    .query("artifactPaperMetadata")
    .withIndex("by_owner_artifact", (q) =>
      q.eq("ownerUserId", args.ownerUserId).eq("artifactId", args.artifactId),
    )
    .unique();
  if (paperMetadata) {
    await ctx.db.patch("artifactPaperMetadata", paperMetadata._id, {
      workspaceId: args.workspaceId,
      updatedAt: args.updatedAt,
    });
  }

  const extractions = await ctx.db
    .query("artifactExtractions")
    .withIndex("by_owner_artifact_extractor", (q) =>
      q.eq("ownerUserId", args.ownerUserId).eq("artifactId", args.artifactId),
    )
    .collect();
  for (const extraction of extractions) {
    await ctx.db.patch("artifactExtractions", extraction._id, {
      workspaceId: args.workspaceId,
      updatedAt: args.updatedAt,
    });
  }
}

async function syncThreadContextRowsAfterArtifactWorkspaceMove(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    artifactId: Id<"artifacts">;
    previousWorkspaceId: Id<"workspaces">;
    targetWorkspaceId: Id<"workspaces">;
  },
) {
  if (args.previousWorkspaceId === args.targetWorkspaceId) {
    return;
  }

  const rows = await ctx.db
    .query("threadContextArtifacts")
    .withIndex("by_owner_workspace_artifact", (q) =>
      q
        .eq("ownerUserId", args.ownerUserId)
        .eq("workspaceId", args.previousWorkspaceId)
        .eq("artifactId", args.artifactId),
    )
    .collect();

  for (const row of rows) {
    const metadata = await ctx.db
      .query("threadMetadata")
      .withIndex("by_thread", (q) => q.eq("threadId", row.threadId))
      .unique();
    if (
      metadata?.ownerUserId === args.ownerUserId &&
      !shouldKeepThreadContextAfterWorkspaceMove({
        threadWorkspaceId: metadata.workspaceId,
        targetWorkspaceId: args.targetWorkspaceId,
      })
    ) {
      await ctx.db.delete("threadContextArtifacts", row._id);
      continue;
    }
    await ctx.db.patch("threadContextArtifacts", row._id, {
      workspaceId: args.targetWorkspaceId,
    });
  }
}
