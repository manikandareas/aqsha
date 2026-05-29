import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import {
  artifactTypeForLegacyArtifact,
  isAgentWritableArtifactType,
} from "../artifactModel";
import { requireCurrentUser } from "../auth";
import { assertWorkspaceArtifactOwner } from "../workspaceAccess";

const PROMPT_CONTEXT_TOTAL_LIMIT = 16_000;
const PROMPT_CONTEXT_ARTIFACT_LIMIT = 4_000;
const MAX_SELECTED_CONTEXT_ARTIFACTS = 12;

type ThreadContextCtx = QueryCtx | MutationCtx;

type SelectedArtifactRow = Doc<"threadContextArtifacts">;

type PromptContextArtifact = {
  artifactId?: string;
  workspaceId?: string;
  title: string;
  artifactType: string;
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
    artifactType: v.string(),
    plainTextPreview: v.optional(v.string()),
    updatedAt: v.number(),
  }),
  url: v.optional(
    v.object({
      normalizedUrl: v.string(),
      status: v.union(v.literal("pending"), v.literal("ready"), v.literal("failed")),
      failureReason: v.optional(v.string()),
    }),
  ),
});

const contextMutationResultValidator = v.object({
  ok: v.boolean(),
  selected: v.boolean(),
});

async function getThreadOwner(ctx: ThreadContextCtx, threadId: string) {
  const thread = await ctx.runQuery(components.agent.threads.getThread, {
    threadId,
  });
  if (!thread?.userId) {
    return null;
  }
  return thread.userId;
}

async function isOwnedThread(ctx: ThreadContextCtx, args: {
  threadId: string;
  ownerUserId: string;
}) {
  const ownerUserId = await getThreadOwner(ctx, args.threadId);
  return ownerUserId === args.ownerUserId;
}

async function assertOwnedThread(ctx: ThreadContextCtx, args: {
  threadId: string;
  ownerUserId: string;
}) {
  if (!(await isOwnedThread(ctx, args))) {
    throw new ConvexError("Thread not found");
  }
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

async function getThreadWorkspaceId(ctx: ThreadContextCtx, args: {
  ownerUserId: string;
  threadId: string;
}) {
  const metadata = await ctx.db
    .query("threadMetadata")
    .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
    .unique();
  if (!metadata || metadata.ownerUserId !== args.ownerUserId) {
    return undefined;
  }
  return metadata.workspaceId;
}

async function assertArtifactAvailableForThread(
  ctx: ThreadContextCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    artifactWorkspaceId: Id<"workspaces">;
  },
) {
  const threadWorkspaceId = await getThreadWorkspaceId(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
  });
  if (threadWorkspaceId && threadWorkspaceId !== args.artifactWorkspaceId) {
    throw new ConvexError("Artifact not available for this thread");
  }
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
  const artifactType = artifactTypeForLegacyArtifact(artifact);
  const url = artifactType === "url"
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
      artifactType,
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
    if (artifact.artifactId) {
      lines.push(`Artifact ID: ${artifact.artifactId}`);
    }
    if (artifact.workspaceId) {
      lines.push(`Workspace ID: ${artifact.workspaceId}`);
    }
    lines.push(`Title: ${artifact.title}`);
    lines.push(`Type: ${artifact.artifactType}`);
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

async function getPromptContextArtifactById(
  ctx: ThreadContextCtx,
  ownerUserId: string,
  artifactId: Id<"artifacts">,
  threadId: string,
  remainingBudget: number,
): Promise<PromptContextArtifact | null> {
  if (remainingBudget <= 0) {
    return null;
  }

  const artifact = await ctx.db.get("artifacts", artifactId);
  if (
    !artifact ||
    artifact.ownerUserId !== ownerUserId ||
    artifact.status !== "active"
  ) {
    return null;
  }

  if (artifact.workspaceId) {
    await assertArtifactAvailableForThread(ctx, {
      ownerUserId,
      threadId,
      artifactWorkspaceId: artifact.workspaceId,
    });
  } else if (artifact.threadId !== threadId) {
    return null;
  }

  const artifactType = artifactTypeForLegacyArtifact(artifact);
  const [contentRow, url] = await Promise.all([
    artifactType !== "url"
      ? ctx.db
          .query("artifactDocuments")
          .withIndex("by_owner_artifact", (q) =>
            q.eq("ownerUserId", ownerUserId).eq("artifactId", artifact._id),
          )
          .unique()
      : Promise.resolve(null),
    artifactType === "url"
      ? getArtifactUrl(ctx, { ownerUserId, artifactId: artifact._id })
      : Promise.resolve(null),
  ]);

  const rawContent =
    artifact.contextText ??
    contentRow?.plainText ??
    contentRow?.markdown ??
    url?.readableText ??
    artifact.body ??
    "";
  const content = clipText(rawContent, Math.min(PROMPT_CONTEXT_ARTIFACT_LIMIT, remainingBudget));

  return {
    artifactId: String(artifact._id),
    workspaceId: artifact.workspaceId ? String(artifact.workspaceId) : undefined,
    title: artifact.title,
    artifactType,
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

  const artifactType = artifactTypeForLegacyArtifact(artifact);
  const [contentRow, url] = await Promise.all([
    artifactType !== "url"
      ? ctx.db
          .query("artifactDocuments")
          .withIndex("by_owner_artifact", (q) =>
            q.eq("ownerUserId", ownerUserId).eq("artifactId", artifact._id),
          )
          .unique()
      : Promise.resolve(null),
    artifactType === "url"
      ? getArtifactUrl(ctx, { ownerUserId, artifactId: artifact._id })
      : Promise.resolve(null),
  ]);

  const rawContent =
    artifact.contextText ??
    contentRow?.plainText ??
    contentRow?.markdown ??
    url?.readableText ??
    artifact.body ??
    "";
  const content = clipText(rawContent, Math.min(PROMPT_CONTEXT_ARTIFACT_LIMIT, remainingBudget));

  return {
    artifactId: String(artifact._id),
    workspaceId: String(artifact.workspaceId),
    title: artifact.title,
    artifactType,
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

export async function listSelectedWorkspaceDocuments(
  ctx: ThreadContextCtx,
  args: {
    ownerUserId: string;
    threadId: string;
  },
) {
  const rows = await listSelectedRows(ctx, args);
  const documents = [];

  for (const row of rows) {
    const artifact = await ctx.db.get("artifacts", row.artifactId);
    if (
      !artifact ||
      artifact.ownerUserId !== args.ownerUserId ||
      artifact.status !== "active" ||
      !isAgentWritableArtifactType(artifactTypeForLegacyArtifact(artifact)) ||
      !artifact.workspaceId
    ) {
      continue;
    }
    documents.push({
      artifactId: String(artifact._id),
      workspaceId: String(artifact.workspaceId),
      title: artifact.title,
    });
  }

  return documents;
}

export async function buildPromptContextForThread(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    messageAttachmentArtifactIds?: Id<"artifacts">[];
  },
) {
  await assertOwnedThread(ctx, args);
  const rows = await listSelectedRows(ctx, args);
  const selectedIds = new Set(rows.map((row) => String(row.artifactId)));
  const messageAttachmentIds = (args.messageAttachmentArtifactIds ?? []).filter(
    (artifactId) => !selectedIds.has(String(artifactId)),
  );

  const resolved = await Promise.all([
    ...rows.map((row) =>
      getPromptContextArtifact(
        ctx,
        args.ownerUserId,
        row,
        PROMPT_CONTEXT_ARTIFACT_LIMIT,
      ),
    ),
    ...messageAttachmentIds.map((artifactId) =>
      getPromptContextArtifactById(
        ctx,
        args.ownerUserId,
        artifactId,
        args.threadId,
        PROMPT_CONTEXT_ARTIFACT_LIMIT,
      ),
    ),
  ]);

  const artifacts: PromptContextArtifact[] = [];
  let remainingBudget = PROMPT_CONTEXT_TOTAL_LIMIT;

  for (const artifact of resolved) {
    if (!artifact || remainingBudget <= 0) {
      continue;
    }
    const content = clipText(artifact.content, remainingBudget);
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
    if (!(await isOwnedThread(ctx, { threadId: args.threadId, ownerUserId: user._id }))) {
      return [];
    }
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
    const rows = await listSelectedRows(ctx, args);
    const threadWorkspaceId = await getThreadWorkspaceId(ctx, args);
    const targetIds = new Set<string>();
    const targets = [];

    for (const row of rows) {
      targetIds.add(String(row.artifactId));
      const artifact = await ctx.db.get("artifacts", row.artifactId);
      const artifactType = artifact ? artifactTypeForLegacyArtifact(artifact) : undefined;
      if (
        !artifact ||
        artifact.ownerUserId !== args.ownerUserId ||
        artifact.status !== "active" ||
        artifactType === "url"
      ) {
        continue;
      }
      if (artifact.workspaceId) {
        if (threadWorkspaceId && artifact.workspaceId !== threadWorkspaceId) {
          continue;
        }
      } else if (artifact.threadId !== args.threadId) {
        continue;
      }
      if (artifact.ragEntryId && artifact.indexingStatus === "ready") {
        targets.push({
          artifactId: artifact._id,
          workspaceId: artifact.workspaceId,
          title: artifact.title,
          ragEntryId: artifact.ragEntryId,
        });
      }
    }

    for (const artifactId of args.messageAttachmentArtifactIds ?? []) {
      if (targetIds.has(String(artifactId))) {
        continue;
      }
      const artifact = await ctx.db.get("artifacts", artifactId);
      const artifactType = artifact ? artifactTypeForLegacyArtifact(artifact) : undefined;
      if (
        !artifact ||
        artifact.ownerUserId !== args.ownerUserId ||
        artifact.status !== "active" ||
        artifactType === "url"
      ) {
        continue;
      }
      if (artifact.workspaceId) {
        if (threadWorkspaceId && artifact.workspaceId !== threadWorkspaceId) {
          continue;
        }
      } else if (artifact.threadId !== args.threadId) {
        continue;
      }
      if (artifact.ragEntryId && artifact.indexingStatus === "ready") {
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
  await assertArtifactAvailableForThread(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    artifactWorkspaceId: artifact.workspaceId,
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

export async function persistMessageContextArtifacts(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    messageId: string;
    snapshot?: Array<{
      artifactId: Id<"artifacts">;
      title: string;
      artifactType?: string;
      source?: "upload" | "workspace";
    }>;
  },
) {
  if (!args.snapshot?.length) {
    return;
  }

  const createdAt = Date.now();
  const inserted = new Set<string>();
  for (const item of args.snapshot) {
    if (inserted.has(String(item.artifactId))) {
      continue;
    }
    const artifact = await ctx.db.get("artifacts", item.artifactId);
    if (!artifact || artifact.ownerUserId !== args.ownerUserId) {
      continue;
    }
    const artifactType = artifactTypeForLegacyArtifact(artifact);
    await ctx.db.insert("messageContextArtifacts", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      messageId: args.messageId,
      artifactId: item.artifactId,
      title: item.title || artifact.title,
      artifactType,
      source: item.source ?? (artifact.threadId ? "upload" : "workspace"),
      createdAt,
    });
    inserted.add(String(item.artifactId));
  }
}

export async function replaceContextArtifactsForThread(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    artifactIds: Id<"artifacts">[];
  },
) {
  await assertOwnedThread(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
  });

  const uniqueArtifactIds = [...new Set(args.artifactIds)];
  if (uniqueArtifactIds.length > MAX_SELECTED_CONTEXT_ARTIFACTS) {
    throw new ConvexError("Too many selected context artifacts");
  }

  const selectedRows = await listSelectedRows(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
  });
  const nextArtifactIds = new Set(uniqueArtifactIds.map(String));

  for (const row of selectedRows) {
    if (!nextArtifactIds.has(String(row.artifactId))) {
      await ctx.db.delete("threadContextArtifacts", row._id);
    }
  }

  const existingArtifactIds = new Set(
    selectedRows
      .filter((row) => nextArtifactIds.has(String(row.artifactId)))
      .map((row) => String(row.artifactId)),
  );

  for (const artifactId of uniqueArtifactIds) {
    if (existingArtifactIds.has(String(artifactId))) {
      continue;
    }
    await insertContextArtifact(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      artifactId,
    });
  }
}

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
    await assertArtifactAvailableForThread(ctx, {
      ownerUserId: user._id,
      threadId: args.threadId,
      artifactWorkspaceId: artifact.workspaceId,
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
