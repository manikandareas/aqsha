import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  internalMutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { assertThreadOwner } from "./threads";

const ARTIFACT_INLINE_LIMIT = 800_000;

const artifactTypeValidator = v.union(
  v.literal("research_report"),
  v.literal("markdown_report"),
  v.literal("research_document"),
  v.literal("source_bundle"),
  v.literal("citation_evidence_view"),
  v.literal("document"),
  v.literal("code"),
  v.literal("html"),
  v.literal("json"),
  v.literal("plain_text"),
);

const contentFormatValidator = v.union(
  v.literal("markdown"),
  v.literal("html"),
  v.literal("plain"),
  v.literal("code"),
  v.literal("json"),
);

const relationValidator = v.union(
  v.literal("created"),
  v.literal("updated"),
  v.literal("referenced"),
);

type ArtifactType =
  | "research_report"
  | "markdown_report"
  | "research_document"
  | "source_bundle"
  | "citation_evidence_view"
  | "document"
  | "code"
  | "html"
  | "json"
  | "plain_text";

type ContentFormat = "markdown" | "html" | "plain" | "code" | "json";

export const list = query({
  args: { threadId: v.string(), runId: v.optional(v.id("agentRuns")) },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertThreadOwner(ctx, args.threadId);
    if (args.runId) {
      await assertRunOwner(ctx, args.runId, user._id);
      return await ctx.db
        .query("artifacts")
        .withIndex("by_owner_run", (q) =>
          q.eq("ownerUserId", user._id).eq("runId", args.runId),
        )
        .collect();
    }
    return await ctx.db
      .query("artifacts")
      .withIndex("by_owner_thread_created", (q) =>
        q.eq("ownerUserId", user._id).eq("threadId", args.threadId),
      )
      .order("desc")
      .take(50);
  },
});

export const get = query({
  args: {
    artifactId: v.id("artifacts"),
    versionId: v.optional(v.id("artifactVersions")),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await ctx.db.get("artifacts", args.artifactId);
    if (!artifact || artifact.ownerUserId !== user._id) {
      return null;
    }

    const versionId = args.versionId ?? artifact.currentVersionId;
    const version = versionId ? await ctx.db.get("artifactVersions", versionId) : null;
    if (!version || version.ownerUserId !== user._id || version.artifactId !== artifact._id) {
      return { ...artifact, version: null };
    }
    return { ...artifact, version };
  },
});

export const listVersions = query({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await ctx.db.get("artifacts", args.artifactId);
    if (!artifact || artifact.ownerUserId !== user._id) {
      return [];
    }
    return await ctx.db
      .query("artifactVersions")
      .withIndex("by_owner_artifact_version", (q) =>
        q.eq("ownerUserId", user._id).eq("artifactId", args.artifactId),
      )
      .collect();
  },
});

export const listForMessage = query({
  args: { messageId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const links = await ctx.db
      .query("messageArtifacts")
      .withIndex("by_owner_message", (q) =>
        q.eq("ownerUserId", user._id).eq("messageId", args.messageId),
      )
      .collect();
    const rows = await Promise.all(
      links.map(async (link) => {
        const artifact = await ctx.db.get("artifacts", link.artifactId);
        const version = await ctx.db.get("artifactVersions", link.versionId);
        if (!artifact || !version || artifact.ownerUserId !== user._id) {
          return null;
        }
        return { ...link, artifact, version };
      }),
    );
    return rows.filter((row) => row !== null);
  },
});

export const listCitationChecks = query({
  args: {
    artifactId: v.id("artifacts"),
    versionId: v.optional(v.id("artifactVersions")),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await ctx.db.get("artifacts", args.artifactId);
    if (!artifact || artifact.ownerUserId !== user._id) {
      return [];
    }
    const rows = await ctx.db
      .query("citationChecks")
      .withIndex("by_owner_artifact", (q) =>
        q.eq("ownerUserId", user._id).eq("artifactId", args.artifactId),
      )
      .collect();
    if (!args.versionId) {
      return rows;
    }
    return rows.filter((row) => row.artifactVersionId === args.versionId);
  },
});

export const createVersionFromAgent = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    runId: v.optional(v.id("agentRuns")),
    type: artifactTypeValidator,
    title: v.string(),
    contentFormat: contentFormatValidator,
    body: v.string(),
    createdByMessageId: v.optional(v.string()),
    changeSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.runId) {
      await assertRunOwner(ctx, args.runId, args.ownerUserId);
    }
    const now = Date.now();
    const artifactId = await ctx.db.insert("artifacts", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      type: args.type,
      title: args.title,
      createdAt: now,
      updatedAt: now,
    });
    const versionId = await insertVersion(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      artifactId,
      runId: args.runId,
      versionNumber: 1,
      title: args.title,
      contentFormat: args.contentFormat,
      body: args.body,
      createdByMessageId: args.createdByMessageId,
      changeSummary: args.changeSummary,
      createdAt: now,
    });
    await ctx.db.patch("artifacts", artifactId, { currentVersionId: versionId });
    return { artifactId, versionId };
  },
});

export const updateVersionFromAgent = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    title: v.optional(v.string()),
    contentFormat: contentFormatValidator,
    body: v.string(),
    createdByMessageId: v.optional(v.string()),
    runId: v.optional(v.id("agentRuns")),
    changeSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const artifact = await assertArtifactOwner(ctx, args.artifactId, args.ownerUserId);
    const versions = await ctx.db
      .query("artifactVersions")
      .withIndex("by_owner_artifact_version", (q) =>
        q.eq("ownerUserId", args.ownerUserId).eq("artifactId", args.artifactId),
      )
      .collect();
    const latest = versions.reduce(
      (max, version) => Math.max(max, version.versionNumber),
      0,
    );
    const now = Date.now();
    const title = args.title ?? artifact.title;
    const versionId = await insertVersion(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: artifact.threadId,
      artifactId: artifact._id,
      runId: args.runId,
      versionNumber: latest + 1,
      title,
      contentFormat: args.contentFormat,
      body: args.body,
      createdByMessageId: args.createdByMessageId,
      changeSummary: args.changeSummary,
      createdAt: now,
    });
    await ctx.db.patch("artifacts", artifact._id, {
      title,
      currentVersionId: versionId,
      updatedAt: now,
    });
    return { artifactId: artifact._id, versionId };
  },
});

export const attachToMessage = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    messageId: v.string(),
    artifactId: v.id("artifacts"),
    versionId: v.id("artifactVersions"),
    relation: relationValidator,
  },
  handler: async (ctx, args) => {
    const artifact = await assertArtifactOwner(ctx, args.artifactId, args.ownerUserId);
    const version = await ctx.db.get("artifactVersions", args.versionId);
    if (
      artifact.threadId !== args.threadId ||
      !version ||
      version.ownerUserId !== args.ownerUserId ||
      version.artifactId !== args.artifactId
    ) {
      throw new ConvexError("Artifact version not found");
    }
    await ctx.db.insert("messageArtifacts", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      messageId: args.messageId,
      artifactId: args.artifactId,
      versionId: args.versionId,
      relation: args.relation,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

export const createResearchReportFromRun = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    runId: v.id("agentRuns"),
    title: v.string(),
    markdown: v.string(),
    changeSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    await createArtifactVersion(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      type: "research_report",
      title: args.title,
      contentFormat: "markdown",
      body: args.markdown,
      changeSummary: args.changeSummary,
    }),
});

async function createArtifactVersion(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    runId?: Id<"agentRuns">;
    type: ArtifactType;
    title: string;
    contentFormat: ContentFormat;
    body: string;
    createdByMessageId?: string;
    changeSummary?: string;
  },
) {
  if (args.runId) {
    await assertRunOwner(ctx, args.runId, args.ownerUserId);
  }
  const now = Date.now();
  const artifactId = await ctx.db.insert("artifacts", {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    runId: args.runId,
    type: args.type,
    title: args.title,
    createdAt: now,
    updatedAt: now,
  });
  const versionId = await insertVersion(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    artifactId,
    runId: args.runId,
    versionNumber: 1,
    title: args.title,
    contentFormat: args.contentFormat,
    body: args.body,
    createdByMessageId: args.createdByMessageId,
    changeSummary: args.changeSummary,
    createdAt: now,
  });
  await ctx.db.patch("artifacts", artifactId, { currentVersionId: versionId });
  return { artifactId, versionId };
}

async function insertVersion(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    artifactId: Id<"artifacts">;
    runId?: Id<"agentRuns">;
    versionNumber: number;
    contentFormat: ContentFormat;
    title: string;
    body: string;
    createdByMessageId?: string;
    changeSummary?: string;
    createdAt: number;
  },
) {
  return await ctx.db.insert("artifactVersions", {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    artifactId: args.artifactId,
    runId: args.runId,
    versionNumber: args.versionNumber,
    contentFormat: args.contentFormat,
    title: args.title,
    body: args.body.length <= ARTIFACT_INLINE_LIMIT ? args.body : undefined,
    createdByMessageId: args.createdByMessageId,
    changeSummary: args.changeSummary,
    createdAt: args.createdAt,
  });
}

async function assertArtifactOwner(
  ctx: QueryCtx | MutationCtx,
  artifactId: Id<"artifacts">,
  ownerUserId: string,
) {
  const artifact = await ctx.db.get("artifacts", artifactId);
  if (!artifact || artifact.ownerUserId !== ownerUserId) {
    throw new ConvexError("Artifact not found");
  }
  return artifact;
}

async function assertRunOwner(
  ctx: QueryCtx | MutationCtx,
  runId: Id<"agentRuns">,
  ownerUserId: string,
) {
  const run = await ctx.db.get("agentRuns", runId);
  if (!run || run.ownerUserId !== ownerUserId) {
    throw new ConvexError("Run not found");
  }
  return run;
}
