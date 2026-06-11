import { ConvexError, v } from "convex/values";
import { components } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server";
import {
  artifactTypeForLegacyArtifact,
  isAgentWritableArtifactType,
} from "../../artifacts/model";
import { requireCurrentUser } from "../../auth";
import { collapse } from "../../lib/text";
import { assertWorkspaceArtifactOwner } from "../../workspaces/access";
import {
  buildActiveSkillBlock,
  buildSkillCatalogBlock,
  loadActiveSkillBodies,
  loadCatalogSkills,
} from "../skills/skillRegistry";

const PROMPT_CONTEXT_TOTAL_LIMIT = 16_000;
const PROMPT_CONTEXT_ARTIFACT_LIMIT = 4_000;
const PROMPT_CONTEXT_THREAD_DOCUMENT_LIMIT = 4;
const THREAD_DOCUMENT_ARTIFACT_SCAN_LIMIT = 12;
const MAX_SELECTED_CONTEXT_ARTIFACTS = 12;
const WORKSPACE_MANIFEST_WORKSPACE_LIMIT = 5;
const WORKSPACE_MANIFEST_ITEM_LIMIT = 40;

type ThreadContextCtx = QueryCtx | MutationCtx;

type SelectedArtifactRow = Doc<"threadContextArtifacts">;
type ContextArtifactTarget = {
  artifact: Doc<"artifacts">;
  source: "selected" | "message_attachment" | "thread_upload";
};

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

export async function isOwnedThread(ctx: ThreadContextCtx, args: {
  threadId: string;
  ownerUserId: string;
}) {
  const ownerUserId = await getThreadOwner(ctx, args.threadId);
  return ownerUserId === args.ownerUserId;
}

export async function assertOwnedThread(ctx: ThreadContextCtx, args: {
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
    .take(THREAD_DOCUMENT_ARTIFACT_SCAN_LIMIT);

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

async function listContextArtifactTargets(
  ctx: ThreadContextCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    messageAttachmentArtifactIds?: Id<"artifacts">[];
  },
) {
  const rows = await listSelectedRows(ctx, args);
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

  for (const row of rows) {
    await appendById(row.artifactId, "selected");
  }
  for (const artifactId of args.messageAttachmentArtifactIds ?? []) {
    await appendById(artifactId, "message_attachment");
  }
  const remainingThreadUploadSlots = Math.max(
    0,
    PROMPT_CONTEXT_THREAD_DOCUMENT_LIMIT,
  );
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

function clipText(value: string, limit: number) {
  const compact = collapse(value);
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
    "<thread_document_context>",
    "These artifacts are active context for this chat thread, including pinned workspace artifacts and uploaded thread documents. Use them when relevant. If they conflict with the user's message, explain the conflict.",
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

  lines.push("</thread_document_context>");
  return lines.join("\n").trim();
}

async function getPromptContextArtifact(
  ctx: ThreadContextCtx,
  ownerUserId: string,
  target: ContextArtifactTarget,
  remainingBudget: number,
): Promise<PromptContextArtifact | null> {
  if (remainingBudget <= 0) {
    return null;
  }

  const artifact = target.artifact;
  const artifactType = artifactTypeForLegacyArtifact(artifact);
  const [contentRow, url] = await Promise.all([
    artifactType !== "url"
      ? ctx.db
          .query("artifactContents")
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
    contentRow?.contextText ??
    contentRow?.plainText ??
    contentRow?.markdown ??
    url?.contextText ??
    url?.readableText ??
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

async function getThreadFiledWorkspaceId(ctx: ThreadContextCtx, args: {
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

/**
 * The workspaces that are active context for a thread: the workspace it is
 * filed under (threadMetadata.workspaceId) plus any @mentioned workspaces
 * (threadContextWorkspaces). Filed-under comes first.
 */
export async function listActiveWorkspaceIdsForThread(
  ctx: ThreadContextCtx,
  args: { ownerUserId: string; threadId: string },
): Promise<Id<"workspaces">[]> {
  const [filedWorkspaceId, rows] = await Promise.all([
    getThreadFiledWorkspaceId(ctx, args),
    ctx.db
      .query("threadContextWorkspaces")
      .withIndex("by_owner_thread_created", (q) =>
        q.eq("ownerUserId", args.ownerUserId).eq("threadId", args.threadId),
      )
      .order("asc")
      .take(WORKSPACE_MANIFEST_WORKSPACE_LIMIT),
  ]);
  const ids: Id<"workspaces">[] = [];
  const seen = new Set<string>();
  if (filedWorkspaceId) {
    ids.push(filedWorkspaceId);
    seen.add(String(filedWorkspaceId));
  }
  for (const row of rows) {
    if (!seen.has(String(row.workspaceId))) {
      seen.add(String(row.workspaceId));
      ids.push(row.workspaceId);
    }
  }
  return ids.slice(0, WORKSPACE_MANIFEST_WORKSPACE_LIMIT);
}

/**
 * A compact manifest of each active workspace and its document titles, so the
 * agent knows which workspaces are attached and can answer "what's in this
 * workspace" directly. Document *content* still flows through RAG retrieval.
 */
async function buildWorkspaceManifestForThread(
  ctx: ThreadContextCtx,
  args: { ownerUserId: string; threadId: string },
): Promise<string> {
  const workspaceIds = await listActiveWorkspaceIdsForThread(ctx, args);
  if (workspaceIds.length === 0) {
    return "";
  }
  const lines = [
    "<thread_workspace_context>",
    "These workspaces are attached as context for this conversation. Each entry lists the workspace name and its document titles. When the user asks what is in a workspace, or to list/summarize its items, answer directly from this manifest. To use a document's full content, rely on the retrieved excerpts below or call searchThreadDocuments.",
    "",
  ];
  for (const workspaceId of workspaceIds) {
    const workspace = await ctx.db.get("workspaces", workspaceId);
    if (
      !workspace ||
      workspace.ownerUserId !== args.ownerUserId ||
      workspace.status !== "active"
    ) {
      continue;
    }
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_owner_workspace_status_updated", (q) =>
        q
          .eq("ownerUserId", args.ownerUserId)
          .eq("workspaceId", workspaceId)
          .eq("status", "active"),
      )
      .order("desc")
      .take(WORKSPACE_MANIFEST_ITEM_LIMIT);
    lines.push(`[Workspace: ${workspace.name}]`);
    lines.push(`Workspace ID: ${workspace._id}`);
    lines.push(
      `Items (${artifacts.length}${artifacts.length >= WORKSPACE_MANIFEST_ITEM_LIMIT ? "+" : ""}):`,
    );
    if (artifacts.length === 0) {
      lines.push("- (empty — no documents yet)");
    } else {
      for (const artifact of artifacts) {
        lines.push(`- ${artifact.title} (${artifactTypeForLegacyArtifact(artifact)})`);
      }
    }
    lines.push("");
  }
  lines.push("</thread_workspace_context>");
  return lines.join("\n").trim();
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
  const [targets, workspaceManifest] = await Promise.all([
    listContextArtifactTargets(ctx, args),
    buildWorkspaceManifestForThread(ctx, args),
  ]);

  const resolved = await Promise.all([
    ...targets.map((target) =>
      getPromptContextArtifact(
        ctx,
        args.ownerUserId,
        target,
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

  const documentBlock = buildContextBlock(artifacts);
  // Skills: tier-1 catalog (name+description of enabled skills) + tier-2
  // re-injection of every skill activated in this thread. Re-materializing the
  // bodies here (a MutationCtx reading the inline bodyText) every turn makes
  // activated skills immune to message compaction/pruning.
  const [catalogSkills, activeSkillBodies] = await Promise.all([
    loadCatalogSkills(ctx, args.ownerUserId),
    loadActiveSkillBodies(ctx, args.ownerUserId, args.threadId),
  ]);
  const skillCatalogBlock = buildSkillCatalogBlock(catalogSkills);
  const activeSkillBlock = buildActiveSkillBlock(activeSkillBodies);
  return [
    workspaceManifest,
    documentBlock,
    skillCatalogBlock,
    activeSkillBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
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
  // Idempotent by messageId: clear rows from any prior run for this message
  // before re-persisting, so re-running (e.g. the deferred-attachments two-phase
  // path) never leaves stale or duplicated context rows.
  const existing = await ctx.db
    .query("messageContextArtifacts")
    .withIndex("by_owner_message", (q) =>
      q.eq("ownerUserId", args.ownerUserId).eq("messageId", args.messageId),
    )
    .collect();
  for (const row of existing) {
    await ctx.db.delete("messageContextArtifacts", row._id);
  }

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

/**
 * Per-message snapshot of the workspaces active when the message was sent
 * (filed-under + @mentioned). Drives the message bubble's workspace badges.
 */
export async function persistMessageContextWorkspaces(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    messageId: string;
  },
) {
  // Idempotent by messageId: clear rows from any prior run before re-inserting,
  // so a re-run cannot duplicate workspace badge rows on the message bubble.
  const existing = await ctx.db
    .query("messageContextWorkspaces")
    .withIndex("by_owner_message", (q) =>
      q.eq("ownerUserId", args.ownerUserId).eq("messageId", args.messageId),
    )
    .collect();
  for (const row of existing) {
    await ctx.db.delete("messageContextWorkspaces", row._id);
  }

  const workspaceIds = await listActiveWorkspaceIdsForThread(ctx, args);
  if (workspaceIds.length === 0) {
    return;
  }
  const createdAt = Date.now();
  for (const workspaceId of workspaceIds) {
    const workspace = await ctx.db.get("workspaces", workspaceId);
    if (
      !workspace ||
      workspace.ownerUserId !== args.ownerUserId ||
      workspace.status !== "active"
    ) {
      continue;
    }
    await ctx.db.insert("messageContextWorkspaces", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      messageId: args.messageId,
      workspaceId,
      name: workspace.name,
      createdAt,
    });
  }
}

/**
 * Add the given workspace artifacts to a thread's pinned context (idempotent,
 * accumulating). Unlike replaceContextArtifactsForThread this never removes
 * existing selections — the composer is add-only; removal happens elsewhere.
 */
export async function addContextArtifactsForThread(
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
  for (const artifactId of [...new Set(args.artifactIds)]) {
    await insertContextArtifact(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      artifactId,
    });
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
