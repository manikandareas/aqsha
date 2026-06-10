import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import {
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server";
import { requireCurrentUser } from "../../auth";
import { throwAppError } from "../../lib/appError";
import { assertWorkspaceOwner } from "../../workspaces/access";
import {
  assertOwnedThread,
  isOwnedThread,
  listActiveWorkspaceIdsForThread,
} from "./threadContext";

export const MAX_SELECTED_CONTEXT_WORKSPACES = 5;

type ThreadContextCtx = QueryCtx | MutationCtx;

const threadWorkspaceValidator = v.object({
  rowId: v.id("threadContextWorkspaces"),
  workspaceId: v.id("workspaces"),
  name: v.string(),
  emoji: v.optional(v.string()),
  createdAt: v.number(),
});

async function listWorkspaceRows(ctx: ThreadContextCtx, args: {
  ownerUserId: string;
  threadId: string;
}) {
  return await ctx.db
    .query("threadContextWorkspaces")
    .withIndex("by_owner_thread_created", (q) =>
      q.eq("ownerUserId", args.ownerUserId).eq("threadId", args.threadId),
    )
    .order("asc")
    .take(MAX_SELECTED_CONTEXT_WORKSPACES);
}

async function getWorkspaceRow(ctx: ThreadContextCtx, args: {
  ownerUserId: string;
  threadId: string;
  workspaceId: Id<"workspaces">;
}) {
  return await ctx.db
    .query("threadContextWorkspaces")
    .withIndex("by_owner_thread_workspace", (q) =>
      q
        .eq("ownerUserId", args.ownerUserId)
        .eq("threadId", args.threadId)
        .eq("workspaceId", args.workspaceId),
    )
    .unique();
}

function tooManyWorkspaces(): never {
  return throwAppError({
    code: "context/too-many-workspaces",
    message: `Maksimum ${MAX_SELECTED_CONTEXT_WORKSPACES} workspace per thread.`,
    severity: "warning",
  });
}

/**
 * Pin a single workspace as a context source for a thread. No-op if already
 * pinned. Returns true when a new row was inserted. Ownership of the thread is
 * the caller's responsibility (mirrors insertContextArtifact in threadContext).
 */
export async function addContextWorkspaceForThread(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    workspaceId: Id<"workspaces">;
  },
) {
  const existing = await getWorkspaceRow(ctx, args);
  if (existing) {
    return false;
  }
  const rows = await listWorkspaceRows(ctx, args);
  if (rows.length >= MAX_SELECTED_CONTEXT_WORKSPACES) {
    tooManyWorkspaces();
  }
  await assertWorkspaceOwner(ctx, args.workspaceId, args.ownerUserId, {
    requireActive: true,
  });
  await ctx.db.insert("threadContextWorkspaces", {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    workspaceId: args.workspaceId,
    createdAt: Date.now(),
  });
  return true;
}

/**
 * Add the given workspaces to a thread's context (idempotent, accumulating).
 * The composer is add-only; removal happens elsewhere.
 */
export async function addContextWorkspacesForThread(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    workspaceIds: Id<"workspaces">[];
  },
) {
  await assertOwnedThread(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
  });
  for (const workspaceId of [...new Set(args.workspaceIds)]) {
    await addContextWorkspaceForThread(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      workspaceId,
    });
  }
}

/**
 * Replace the full set of workspace context references for a thread. Mirrors
 * replaceContextArtifactsForThread.
 */
export async function replaceContextWorkspacesForThread(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    workspaceIds: Id<"workspaces">[];
  },
) {
  await assertOwnedThread(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
  });

  const uniqueWorkspaceIds = [...new Set(args.workspaceIds)];
  if (uniqueWorkspaceIds.length > MAX_SELECTED_CONTEXT_WORKSPACES) {
    tooManyWorkspaces();
  }

  const rows = await listWorkspaceRows(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
  });
  const nextWorkspaceIds = new Set(uniqueWorkspaceIds.map(String));

  for (const row of rows) {
    if (!nextWorkspaceIds.has(String(row.workspaceId))) {
      await ctx.db.delete("threadContextWorkspaces", row._id);
    }
  }

  const existingWorkspaceIds = new Set(
    rows
      .filter((row) => nextWorkspaceIds.has(String(row.workspaceId)))
      .map((row) => String(row.workspaceId)),
  );

  for (const workspaceId of uniqueWorkspaceIds) {
    if (existingWorkspaceIds.has(String(workspaceId))) {
      continue;
    }
    await assertWorkspaceOwner(ctx, workspaceId, args.ownerUserId, {
      requireActive: true,
    });
    await ctx.db.insert("threadContextWorkspaces", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      workspaceId,
      createdAt: Date.now(),
    });
  }
}

export const listWorkspacesForThread = query({
  args: {
    threadId: v.string(),
  },
  returns: v.array(threadWorkspaceValidator),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    if (!(await isOwnedThread(ctx, { threadId: args.threadId, ownerUserId: user._id }))) {
      return [];
    }
    const rows = await listWorkspaceRows(ctx, {
      ownerUserId: user._id,
      threadId: args.threadId,
    });
    const result = (
      await Promise.all(
        rows.map(async (row) => {
          const workspace = await ctx.db.get("workspaces", row.workspaceId);
          if (
            !workspace ||
            workspace.ownerUserId !== user._id ||
            workspace.status !== "active"
          ) {
            return null;
          }
          return {
            rowId: row._id,
            workspaceId: row.workspaceId,
            name: workspace.name,
            emoji: workspace.emoji,
            createdAt: row.createdAt,
          };
        }),
      )
    ).filter((entry) => entry !== null);
    return result;
  },
});

export const listWorkspaceRagTargetsForThread = internalQuery({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
  },
  returns: v.array(v.object({ workspaceId: v.id("workspaces") })),
  handler: async (ctx, args) => {
    if (!(await isOwnedThread(ctx, args))) {
      return [];
    }
    // Active workspaces = filed-under + @mentioned, so RAG retrieval covers a
    // workspace-detail thread's workspace even when it was never @mentioned.
    const workspaceIds = await listActiveWorkspaceIdsForThread(ctx, args);
    const targets: Array<{ workspaceId: Id<"workspaces"> }> = [];
    for (const workspaceId of workspaceIds) {
      const workspace = await ctx.db.get("workspaces", workspaceId);
      if (
        !workspace ||
        workspace.ownerUserId !== args.ownerUserId ||
        workspace.status !== "active"
      ) {
        continue;
      }
      targets.push({ workspaceId });
    }
    return targets;
  },
});
