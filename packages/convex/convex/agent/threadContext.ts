import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { assertWorkspaceArtifactOwner } from "../workspaceAccess";

const PROMPT_CONTEXT_TOTAL_LIMIT = 16_000;
const PROMPT_CONTEXT_ARTIFACT_LIMIT = 4_000;
const MAX_SELECTED_CONTEXT_ARTIFACTS = 12;

type ThreadContextCtx = QueryCtx | MutationCtx;

type SelectedArtifactRow = Doc<"threadContextArtifacts">;

type PromptContextArtifact = {
  title: string;
  kind: "document" | "url" | "unknown";
  url?: {
    normalizedUrl: string;
    status: "pending" | "ready" | "failed";
    failureReason?: string;
  };
  content: string;
};

const selectedContextValidator = v.object({
  _id: v.id("threadContextArtifacts"),
  threadId: v.string(),
  workspaceId: v.optional(v.id("workspaces")),
  artifactId: v.id("artifacts"),
  createdAt: v.number(),
  artifact: v.object({
    title: v.string(),
    kind: v.optional(v.union(v.literal("document"), v.literal("url"))),
    type: v.optional(v.string()),
    plainTextPreview: v.optional(v.string()),
    updatedAt: v.number(),
  }),
  url: v.optional(v.object({
    normalizedUrl: v.string(),
    status: v.union(v.literal("pending"), v.literal("ready"), v.literal("failed")),
    failureReason: v.optional(v.string()),
  })),
});

const contextMutationResultValidator = v.object({
  ok: v.boolean(),
  selected: v.boolean(),
});

async function getThreadOwner(ctx: ThreadContextCtx, threadId: string) {
  const thread = await ctx.runQuery(components.agent.threads.getThread, {
    threadId,
  });
  if (!thread) {
    throw new ConvexError("Thread not found");
  }
  return thread.userId;
}

async function assertOwnedThread(ctx: ThreadContextCtx, args: {
  threadId: string;
  ownerUserId: string;
}) {
  const ownerUserId = await getThreadOwner(ctx, args.threadId);
  if (ownerUserId !== args.ownerUserId) {
    throw new ConvexError("Thread not found");
  }
}

async function getThreadWorkspaceId(ctx: ThreadContextCtx, threadId: string) {
  const metadata = await ctx.db
    .query("threadMetadata")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .unique();
  return metadata?.workspaceId;
}

async function getSelectedRow(ctx: ThreadContextCtx, args: {
  ownerUserId: string;
  threadId: string;
  artifactId: Id<"artifacts">;
}) {
  return await ctx.db
    .query("threadContextArtifacts")
    .withIndex("by_owner_thread_artifact", (q) =>
      q
        .eq("ownerUserId", args.ownerUserId)
        .eq("threadId", args.threadId)
        .eq("artifactId", args.artifactId),
    )
    .unique();
}

async function listSelectedRows(ctx: ThreadContextCtx, args: {
  ownerUserId: string;
  threadId: string;
}) {
  return await ctx.db
    .query("threadContextArtifacts")
    .withIndex("by_owner_thread_created", (q) =>
      q.eq("ownerUserId", args.ownerUserId).eq("threadId", args.threadId),
    )
    .order("asc")
    .take(MAX_SELECTED_CONTEXT_ARTIFACTS);
}

async function getArtifactUrl(ctx: ThreadContextCtx, args: {
  ownerUserId: string;
  artifactId: Id<"artifacts">;
}) {
  return await ctx.db
    .query("artifactUrls")
    .withIndex("by_owner_artifact", (q) =>
      q.eq("ownerUserId", args.ownerUserId).eq("artifactId", args.artifactId),
    )
    .unique();
}

async function selectedRowToSummary(
  ctx: ThreadContextCtx,
  ownerUserId: string,
  row: SelectedArtifactRow,
) {
  const artifact = await ctx.db.get("artifacts", row.artifactId);
  if (
    !artifact ||
    artifact.ownerUserId !== ownerUserId ||
    artifact.status !== "active" ||
    !artifact.workspaceId
  ) {
    return null;
  }
  const url = artifact.kind === "url"
    ? await getArtifactUrl(ctx, { ownerUserId, artifactId: artifact._id })
    : null;

  return {
    _id: row._id,
    threadId: row.threadId,
    workspaceId: row.workspaceId,
    artifactId: row.artifactId,
    createdAt: row.createdAt,
    artifact: {
      title: artifact.title,
      kind: artifact.kind,
      type: artifact.type,
      plainTextPreview: artifact.plainTextPreview,
      updatedAt: artifact.updatedAt,
    },
    url: url
      ? {
          normalizedUrl: url.normalizedUrl,
          status: url.status,
          failureReason: url.failureReason,
        }
      : undefined,
  };
}

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function clipText(value: string, limit: number) {
  const compact = compactText(value);
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function buildContextBlock(artifacts: PromptContextArtifact[]) {
  if (artifacts.length === 0) {
    return "";
  }

  const lines = [
    "<selected_workspace_context>",
    "The user selected these workspace artifacts as context. Use them when relevant. If they conflict with the user's message, explain the conflict.",
    "",
  ];

  for (const [index, artifact] of artifacts.entries()) {
    lines.push(`[Artifact ${index + 1}]`);
    lines.push(`Title: ${artifact.title}`);
    lines.push(`Type: ${artifact.kind}`);
    if (artifact.url) {
      lines.push(`URL: ${artifact.url.normalizedUrl}`);
      lines.push(`URL status: ${artifact.url.status}`);
      if (artifact.url.failureReason) {
        lines.push(`URL failure: ${artifact.url.failureReason}`);
      }
    }
    if (artifact.content) {
      lines.push("Content:");
      lines.push(artifact.content);
    } else {
      lines.push("Content: Unavailable or not extracted yet.");
    }
    lines.push("");
  }

  lines.push("</selected_workspace_context>");
  return lines.join("\n").trim();
}

async function getPromptContextArtifact(
  ctx: ThreadContextCtx,
  ownerUserId: string,
  row: SelectedArtifactRow,
  remainingBudget: number,
): Promise<PromptContextArtifact | null> {
  if (remainingBudget <= 0) {
    return null;
  }

  const artifact = await ctx.db.get("artifacts", row.artifactId);
  if (
    !artifact ||
    artifact.ownerUserId !== ownerUserId ||
    artifact.status !== "active" ||
    !artifact.workspaceId
  ) {
    return null;
  }

  const [document, url] = await Promise.all([
    artifact.kind === "document"
      ? ctx.db
          .query("artifactDocuments")
          .withIndex("by_owner_artifact", (q) =>
            q.eq("ownerUserId", ownerUserId).eq("artifactId", artifact._id),
          )
          .unique()
      : Promise.resolve(null),
    artifact.kind === "url"
      ? getArtifactUrl(ctx, { ownerUserId, artifactId: artifact._id })
      : Promise.resolve(null),
  ]);

  const rawContent =
    artifact.contextText ??
    document?.plainText ??
    document?.markdown ??
    url?.readableText ??
    artifact.body ??
    "";
  const content = clipText(rawContent, Math.min(PROMPT_CONTEXT_ARTIFACT_LIMIT, remainingBudget));

  return {
    title: artifact.title,
    kind: artifact.kind ?? "unknown",
    url: url
      ? {
          normalizedUrl: url.normalizedUrl,
          status: url.status,
          failureReason: url.failureReason,
        }
      : undefined,
    content,
  };
}

export async function buildPromptContextForThread(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
  },
) {
  await assertOwnedThread(ctx, args);
  const rows = await listSelectedRows(ctx, args);
  const resolved = await Promise.all(
    rows.map((row) =>
      getPromptContextArtifact(
        ctx,
        args.ownerUserId,
        row,
        PROMPT_CONTEXT_ARTIFACT_LIMIT,
      ),
    ),
  );

  const artifacts: PromptContextArtifact[] = [];
  let remainingBudget = PROMPT_CONTEXT_TOTAL_LIMIT;

  for (const artifact of resolved) {
    if (!artifact || remainingBudget <= 0) {
      continue;
    }
    const content = clipText(artifact.content, remainingBudget);
    if (!content) {
      break;
    }
    artifacts.push({ ...artifact, content });
    remainingBudget -= content.length;
  }

  return buildContextBlock(artifacts);
}

export function prependPromptContext(args: {
  prompt: string;
  contextBlock: string;
}) {
  if (!args.contextBlock) {
    return args.prompt;
  }
  return [
    args.contextBlock,
    "",
    "User message:",
    args.prompt,
  ].join("\n");
}

export const listForThread = query({
  args: {
    threadId: v.string(),
  },
  returns: v.array(selectedContextValidator),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertOwnedThread(ctx, { threadId: args.threadId, ownerUserId: user._id });
    const rows = await listSelectedRows(ctx, {
      ownerUserId: user._id,
      threadId: args.threadId,
    });
    const summaries = await Promise.all(
      rows.map((row) => selectedRowToSummary(ctx, user._id, row)),
    );
    return summaries.filter((summary) => summary !== null);
  },
});

async function insertContextArtifact(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    artifactId: Id<"artifacts">;
  },
) {
  const artifact = await assertWorkspaceArtifactOwner(ctx, args.artifactId, args.ownerUserId, {
    requireActive: true,
  });
  const existing = await getSelectedRow(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    artifactId: args.artifactId,
  });
  if (existing) {
    return false;
  }

  const selectedRows = await listSelectedRows(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
  });
  if (selectedRows.length >= MAX_SELECTED_CONTEXT_ARTIFACTS) {
    throw new ConvexError("Too many selected context artifacts");
  }

  await ctx.db.insert("threadContextArtifacts", {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    workspaceId: artifact.workspaceId,
    artifactId: artifact._id,
    createdAt: Date.now(),
  });
  return true;
}

export const add = mutation({
  args: {
    threadId: v.string(),
    artifactId: v.id("artifacts"),
  },
  returns: contextMutationResultValidator,
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertOwnedThread(ctx, { threadId: args.threadId, ownerUserId: user._id });
    await insertContextArtifact(ctx, {
      ownerUserId: user._id,
      threadId: args.threadId,
      artifactId: args.artifactId,
    });
    return { ok: true, selected: true };
  },
});

export const addMany = mutation({
  args: {
    threadId: v.string(),
    artifactIds: v.array(v.id("artifacts")),
  },
  returns: v.object({
    ok: v.boolean(),
    addedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertOwnedThread(ctx, { threadId: args.threadId, ownerUserId: user._id });

    const uniqueArtifactIds = [...new Set(args.artifactIds)];
    let addedCount = 0;

    for (const artifactId of uniqueArtifactIds) {
      const inserted = await insertContextArtifact(ctx, {
        ownerUserId: user._id,
        threadId: args.threadId,
        artifactId,
      });
      if (inserted) {
        addedCount += 1;
      }
    }

    return { ok: true, addedCount };
  },
});

export const toggle = mutation({
  args: {
    threadId: v.string(),
    artifactId: v.id("artifacts"),
  },
  returns: contextMutationResultValidator,
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertOwnedThread(ctx, { threadId: args.threadId, ownerUserId: user._id });
    const existing = await getSelectedRow(ctx, {
      ownerUserId: user._id,
      threadId: args.threadId,
      artifactId: args.artifactId,
    });
    if (existing) {
      await ctx.db.delete("threadContextArtifacts", existing._id);
      return { ok: true, selected: false };
    }

    const artifact = await assertWorkspaceArtifactOwner(ctx, args.artifactId, user._id, {
      requireActive: true,
    });
    const selectedRows = await listSelectedRows(ctx, {
      ownerUserId: user._id,
      threadId: args.threadId,
    });
    if (selectedRows.length >= MAX_SELECTED_CONTEXT_ARTIFACTS) {
      throw new ConvexError("Too many selected context artifacts");
    }

    await ctx.db.insert("threadContextArtifacts", {
      ownerUserId: user._id,
      threadId: args.threadId,
      workspaceId: artifact.workspaceId,
      artifactId: artifact._id,
      createdAt: Date.now(),
    });
    return { ok: true, selected: true };
  },
});
