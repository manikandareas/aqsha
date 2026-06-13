import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireCurrentUser } from "./auth";
import { throwAppError } from "./lib/appError";
import { PLAN_CATALOG } from "./billing/catalog";
import { getBillingSnapshot } from "./billing/entitlements";
import {
  ARTIFACT_BODY_INLINE_LIMIT,
  type ArtifactType,
  artifactFamilyForType,
  artifactTypeForLegacyArtifact,
  artifactTypeFromAgentInput,
  contextFromText,
  defaultLanguageForArtifactType,
  indexingStatusForLegacy,
  isAgentWritableArtifactType,
  normalizeUrl,
  plainTextFromMarkdown,
  previewFromText,
  siteNameFromUrl,
  titleFromUrl,
} from "./artifacts/model";
import {
  assertFolderOwner,
  assertThreadAttachmentOwner,
  assertUploadedArtifactOwner,
  assertWorkspaceArtifactOwner,
  assertWorkspaceOwner,
  normalizeName,
} from "./workspaces/access";
import { workspaceEmojiForNewWorkspace } from "./workspaces/emoji";
import { syncArtifactWorkspaceMove } from "./workspaces/moveModel";
import { assertThreadOwner } from "./agent/threads";

const markdownTitleFallback = "Untitled markdown";

const artifactTypeValidator = v.union(
  v.literal("markdown"),
  v.literal("plain_text"),
  v.literal("pdf"),
  v.literal("docx"),
  v.literal("html"),
  v.literal("svg"),
  v.literal("mermaid"),
  v.literal("json"),
  v.literal("csv"),
  v.literal("code"),
  v.literal("url"),
);

const detectedDocumentKindValidator = v.union(
  v.literal("generic"),
  v.literal("scholarly_paper"),
);

const generatedArtifactTypeValidator = v.union(
  v.literal("markdown"),
  v.literal("plain_text"),
  v.literal("html"),
  v.literal("svg"),
  v.literal("mermaid"),
  v.literal("json"),
  v.literal("csv"),
  v.literal("code"),
);

type ArtifactRenderPayload =
  | {
      artifactType: "markdown";
      blocksJson: string;
      markdown: string;
      plainText: string;
    }
  | {
      artifactType: "pdf" | "docx";
      fileName: string;
      mimeType: string;
      byteSize: number;
      url: string;
      indexingStatus: "not_indexed" | "pending" | "ready" | "failed";
      indexingFailureReason?: string;
    }
  | {
      artifactType: "url";
      originalUrl: string;
      normalizedUrl: string;
      status: "pending" | "ready" | "failed";
      title?: string;
      description?: string;
      siteName?: string;
      failureReason?: string;
      readableText: string;
    }
  | {
      artifactType: "plain_text" | "html" | "svg" | "mermaid" | "json" | "csv" | "code";
      source: string;
      language?: string;
    };

type ArtifactReadModelInput = {
  artifactType?: ArtifactType;
  artifactFamily?: string;
  source?: string;
  indexingStatus?: "not_indexed" | "pending" | "ready" | "failed";
  kind?: string;
  type?: string;
  contentFormat?: string;
  mimeType?: string;
  fileName?: string;
  storageId?: Id<"_storage">;
};

function sourceForLegacyArtifact(
  artifact: ArtifactReadModelInput,
  artifactType: ArtifactType,
) {
  if (
    artifact.source === "manual" ||
    artifact.source === "upload" ||
    artifact.source === "agent" ||
    artifact.source === "url"
  ) {
    return artifact.source;
  }
  if (artifactType === "url") {
    return "url";
  }
  if (artifact.storageId) {
    return "upload";
  }
  return "manual";
}

function normalizeArtifactReadModel<T extends ArtifactReadModelInput>(artifact: T) {
  const artifactType = artifactTypeForLegacyArtifact(artifact);
  return {
    ...artifact,
    artifactType,
    artifactFamily: artifact.artifactFamily ?? artifactFamilyForType(artifactType),
    source: sourceForLegacyArtifact(artifact, artifactType),
    indexingStatus: indexingStatusForLegacy(artifact.indexingStatus),
  };
}

function toArtifactListItem(artifact: Doc<"artifacts">) {
  const normalized = normalizeArtifactReadModel(artifact);
  return {
    _id: artifact._id,
    workspaceId: artifact.workspaceId,
    folderId: artifact.folderId,
    artifactType: normalized.artifactType,
    artifactFamily: normalized.artifactFamily,
    source: normalized.source,
    title: artifact.title,
    language: artifact.language,
    mimeType: artifact.mimeType,
    fileName: artifact.fileName,
    byteSize: artifact.byteSize,
    indexingStatus: normalized.indexingStatus,
    indexingFailureReason: artifact.indexingFailureReason,
    detectedDocumentKind: artifact.detectedDocumentKind,
    plainTextPreview: artifact.plainTextPreview,
    status: artifact.status,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  };
}

export const listByWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
    folderId: v.optional(v.id("workspaceFolders")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertWorkspaceOwner(ctx, args.workspaceId, user._id);
    if (args.folderId) {
      await assertFolderOwner(ctx, args.folderId, user._id, args.workspaceId);
      const result = await ctx.db
        .query("artifacts")
        .withIndex("by_owner_workspace_folder_status_updated", (q) =>
          q
            .eq("ownerUserId", user._id)
            .eq("workspaceId", args.workspaceId)
            .eq("folderId", args.folderId)
            .eq("status", "active"),
        )
        .order("desc")
        .paginate(args.paginationOpts);
      return {
        ...result,
        page: result.page.map(toArtifactListItem),
      };
    }
    const result = await ctx.db
      .query("artifacts")
      .withIndex("by_owner_workspace_status_updated", (q) =>
        q
          .eq("ownerUserId", user._id)
          .eq("workspaceId", args.workspaceId)
          .eq("status", "active"),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map(toArtifactListItem),
    };
  },
});

export const listForContextPicker = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertWorkspaceOwner(ctx, args.workspaceId, user._id);
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_owner_workspace_status_updated", (q) =>
        q
          .eq("ownerUserId", user._id)
          .eq("workspaceId", args.workspaceId)
          .eq("status", "active"),
      )
      .order("desc")
      .take(50);
    return artifacts.map(toArtifactListItem);
  },
});

export const get = query({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await ctx.db.get("artifacts", args.artifactId);
    if (!artifact || artifact.ownerUserId !== user._id || !artifact.workspaceId) {
      return null;
    }
    const artifactType = artifactTypeForLegacyArtifact(artifact);
    const [content, url] = await Promise.all([
      getContentRowOrNull(ctx, artifact._id, user._id),
      artifactType === "url"
        ? getUrlRowOrNull(ctx, artifact._id, user._id)
        : Promise.resolve(null),
    ]);
    return { artifact: normalizeArtifactReadModel(artifact), content, url };
  },
});

export const createDocument = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    folderId: v.optional(v.id("workspaceFolders")),
    title: v.optional(v.string()),
  },
  returns: v.id("artifacts"),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertWorkspaceOwner(ctx, args.workspaceId, user._id, { requireActive: true });
    if (args.folderId) {
      await assertFolderOwner(ctx, args.folderId, user._id, args.workspaceId);
    }
    await assertLibraryCapacity(ctx, user._id);
    const now = Date.now();
    const title = args.title ? normalizeName(args.title, "Artifact title") : markdownTitleFallback;
    const artifactId = await ctx.db.insert("artifacts", {
      ownerUserId: user._id,
      workspaceId: args.workspaceId,
      folderId: args.folderId,
      artifactType: "markdown",
      artifactFamily: artifactFamilyForType("markdown"),
      source: "manual",
      title,
      language: "markdown",
      indexingStatus: "ready",
      plainTextPreview: "",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("artifactContents", {
      ownerUserId: user._id,
      workspaceId: args.workspaceId,
      artifactId,
      blocksJson: "",
      markdown: "",
      plainText: "",
      contextText: "",
      createdAt: now,
      updatedAt: now,
    });
    return artifactId;
  },
});

export const generateUploadUrl = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    threadId: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    if (args.workspaceId) {
      await assertWorkspaceOwner(ctx, args.workspaceId, user._id, { requireActive: true });
    } else if (args.threadId) {
      await assertThreadOwner(ctx, args.threadId);
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateDocument = action({
  args: {
    artifactId: v.id("artifacts"),
    title: v.optional(v.string()),
    blocksJson: v.optional(v.string()),
    markdown: v.optional(v.string()),
    plainText: v.string(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const storageId = await storeOversizedText(ctx, args.plainText, "text/plain");
    const blocksStorageId = args.blocksJson
      ? await storeOversizedText(ctx, args.blocksJson, "application/json")
      : undefined;
    const markdownStorageId = args.markdown
      ? await storeOversizedText(ctx, args.markdown, "text/markdown")
      : undefined;
    await ctx.runMutation(internal.artifacts.updateMarkdownInternal, {
      ownerUserId: user._id,
      artifactId: args.artifactId,
      title: args.title,
      blocksJson: args.blocksJson,
      markdown: args.markdown,
      plainText: args.plainText,
      storageId,
      blocksStorageId,
      markdownStorageId,
    });
    return { ok: true };
  },
});

export const getRenderPayload = action({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args): Promise<ArtifactRenderPayload | null> => {
    const user = await requireCurrentUser(ctx);
    const target = await ctx.runQuery(internal.artifacts.getContentTarget, {
      ownerUserId: user._id,
      artifactId: args.artifactId,
    });
    if (!target) {
      return null;
    }

    const { artifact, content, url } = target;
    const artifactType = artifactTypeForLegacyArtifact(artifact);

    if (artifactType === "url") {
      if (!url) return null;
      const readableText =
        url.readableText ??
        (url.storageId ? await readStorageText(ctx, url.storageId) : "");
      return {
        artifactType: "url",
        originalUrl: url.originalUrl,
        normalizedUrl: url.normalizedUrl,
        status: url.status,
        title: url.title,
        description: url.description,
        siteName: url.siteName,
        failureReason: url.failureReason,
        readableText,
      };
    }

    if (artifactType === "pdf" || artifactType === "docx") {
      if (!artifact.storageId) {
        return null;
      }
      const url = await ctx.storage.getUrl(artifact.storageId);
      if (!url) {
        return null;
      }
      return {
        artifactType,
        fileName: artifact.fileName ?? artifact.title,
        mimeType: artifact.mimeType ?? "application/octet-stream",
        byteSize: artifact.byteSize ?? 0,
        url,
        indexingStatus: indexingStatusForLegacy(artifact.indexingStatus),
        indexingFailureReason: artifact.indexingFailureReason,
      };
    }

    if (artifactType === "markdown") {
      const blocksJson =
        content?.blocksJson ??
        (content?.blocksStorageId ? await readStorageText(ctx, content.blocksStorageId) : "");
      const markdown =
        content?.markdown ??
        (content?.markdownStorageId ? await readStorageText(ctx, content.markdownStorageId) : "");
      const plainText =
        content?.plainText ??
        (content?.storageId ? await readStorageText(ctx, content.storageId) : "");
      return {
        artifactType: "markdown",
        blocksJson,
        markdown,
        plainText,
      };
    }

    const source =
      content?.plainText ??
      content?.markdown ??
      (content?.storageId ? await readStorageText(ctx, content.storageId) : undefined) ??
      (artifact.storageId ? await readStorageText(ctx, artifact.storageId) : "");
    if (
      artifactType !== "plain_text" &&
      artifactType !== "html" &&
      artifactType !== "svg" &&
      artifactType !== "mermaid" &&
      artifactType !== "json" &&
      artifactType !== "csv" &&
      artifactType !== "code"
    ) {
      return null;
    }
    return {
      artifactType,
      source,
      language: artifact.language,
    };
  },
});

export const createUrl = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    folderId: v.optional(v.id("workspaceFolders")),
    url: v.string(),
    title: v.optional(v.string()),
  },
  returns: v.id("artifacts"),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertWorkspaceOwner(ctx, args.workspaceId, user._id, { requireActive: true });
    if (args.folderId) {
      await assertFolderOwner(ctx, args.folderId, user._id, args.workspaceId);
    }
    const normalizedUrl = normalizeUrl(args.url);
    const existingUrl = await ctx.db
      .query("artifactUrls")
      .withIndex("by_owner_workspace_normalized_url", (q) =>
        q
          .eq("ownerUserId", user._id)
          .eq("workspaceId", args.workspaceId)
          .eq("normalizedUrl", normalizedUrl),
      )
      .first();
    if (existingUrl) {
      const artifact = await ctx.db.get("artifacts", existingUrl.artifactId);
      if (artifact?.ownerUserId === user._id && artifact.status === "active") {
        return artifact._id;
      }
    }
    await assertLibraryCapacity(ctx, user._id);

    const now = Date.now();
    const title = args.title ? normalizeName(args.title, "Artifact title") : titleFromUrl(normalizedUrl);
    const artifactId = await ctx.db.insert("artifacts", {
      ownerUserId: user._id,
      workspaceId: args.workspaceId,
      folderId: args.folderId,
      artifactType: "url",
      artifactFamily: artifactFamilyForType("url"),
      source: "url",
      title,
      language: "url",
      mimeType: "text/uri-list",
      indexingStatus: "pending",
      plainTextPreview: normalizedUrl,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("artifactUrls", {
      ownerUserId: user._id,
      workspaceId: args.workspaceId,
      artifactId,
      originalUrl: args.url.trim(),
      normalizedUrl,
      status: "pending",
      title,
      siteName: siteNameFromUrl(normalizedUrl),
      contextText: normalizedUrl,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.papers.ingest.ingest.ingestUrl, {
      artifactId,
    });
    return artifactId;
  },
});

export const retryUrlExtraction = mutation({
  args: { artifactId: v.id("artifacts") },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await assertWorkspaceArtifactOwner(ctx, args.artifactId, user._id, {
      requireActive: true,
    });
    await assertWorkspaceOwner(ctx, artifact.workspaceId, user._id, { requireActive: true });
    if (artifactTypeForLegacyArtifact(artifact) !== "url") {
      throwAppError({
        message: "Artifact is not a URL",
        code: "artifact_not_url",
      });
    }
    const row = await getUrlRow(ctx, args.artifactId, user._id);
    await ctx.db.patch("artifacts", args.artifactId, {
      indexingStatus: "pending",
      indexingFailureReason: undefined,
      updatedAt: Date.now(),
    });
    await ctx.db.patch("artifactUrls", row._id, {
      status: "pending",
      failureReason: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.papers.ingest.ingest.ingestUrl, {
      artifactId: args.artifactId,
    });
    return { ok: true };
  },
});

export const rename = mutation({
  args: {
    artifactId: v.id("artifacts"),
    title: v.string(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await assertWorkspaceArtifactOwner(ctx, args.artifactId, user._id, {
      requireActive: true,
    });
    await assertWorkspaceOwner(ctx, artifact.workspaceId, user._id, { requireActive: true });
    await ctx.db.patch("artifacts", args.artifactId, {
      title: normalizeName(args.title, "Artifact title"),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const move = mutation({
  args: {
    artifactId: v.id("artifacts"),
    targetWorkspaceId: v.optional(v.id("workspaces")),
    folderId: v.optional(v.id("workspaceFolders")),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await assertWorkspaceArtifactOwner(ctx, args.artifactId, user._id, {
      requireActive: true,
    });
    await assertWorkspaceOwner(ctx, artifact.workspaceId, user._id, { requireActive: true });
    const targetWorkspaceId = args.targetWorkspaceId ?? artifact.workspaceId;
    await assertWorkspaceOwner(ctx, targetWorkspaceId, user._id, { requireActive: true });
    if (args.folderId) {
      await assertFolderOwner(ctx, args.folderId, user._id, targetWorkspaceId);
    }
    const now = Date.now();
    await ctx.db.patch("artifacts", args.artifactId, {
      workspaceId: targetWorkspaceId,
      folderId: args.folderId,
      updatedAt: now,
    });
    await syncArtifactWorkspaceMove(ctx, {
      ownerUserId: user._id,
      artifactId: args.artifactId,
      previousWorkspaceId: artifact.workspaceId,
      targetWorkspaceId,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { artifactId: v.id("artifacts") },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await assertWorkspaceArtifactOwner(ctx, args.artifactId, user._id, {
      requireActive: true,
    });
    await assertWorkspaceOwner(ctx, artifact.workspaceId, user._id, { requireActive: true });
    const now = Date.now();
    await ctx.db.patch("artifacts", args.artifactId, {
      status: "deleted",
      deletedAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const updateMarkdownInternal = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    title: v.optional(v.string()),
    blocksJson: v.optional(v.string()),
    markdown: v.optional(v.string()),
    plainText: v.string(),
    storageId: v.optional(v.id("_storage")),
    blocksStorageId: v.optional(v.id("_storage")),
    markdownStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const artifact = await assertWorkspaceArtifactOwner(ctx, args.artifactId, args.ownerUserId, {
      requireActive: true,
    });
    await assertWorkspaceOwner(ctx, artifact.workspaceId, args.ownerUserId, { requireActive: true });
    if (artifactTypeForLegacyArtifact(artifact) !== "markdown") {
      throwAppError({
        message: "Artifact is not editable Markdown",
        code: "artifact_not_editable_markdown",
      });
    }
    const row = await getContentRow(ctx, args.artifactId, args.ownerUserId);
    const now = Date.now();
    const title = args.title ? normalizeName(args.title, "Artifact title") : artifact.title;
    const inlinePlainText =
      args.plainText.length <= ARTIFACT_BODY_INLINE_LIMIT ? args.plainText : undefined;
    const inlineBlocksJson =
      args.blocksJson && args.blocksJson.length <= ARTIFACT_BODY_INLINE_LIMIT
        ? args.blocksJson
        : undefined;
    const inlineMarkdown =
      args.markdown && args.markdown.length <= ARTIFACT_BODY_INLINE_LIMIT
        ? args.markdown
        : undefined;
    await ctx.db.patch("artifacts", args.artifactId, {
      title,
      plainTextPreview: previewFromText(args.plainText),
      indexingStatus: "ready",
      updatedAt: now,
    });
    await ctx.db.patch("artifactContents", row._id, {
      blocksJson: inlineBlocksJson,
      markdown: inlineMarkdown,
      plainText: inlinePlainText,
      contextText: contextFromText(args.plainText),
      storageId: args.storageId,
      blocksStorageId: args.blocksStorageId,
      markdownStorageId: args.markdownStorageId,
      updatedAt: now,
    });
  },
});

export const createThreadAttachmentInternal = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    title: v.string(),
    artifactType: artifactTypeValidator,
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    byteSize: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const title = normalizeName(args.title, "Artifact title");
    const artifactId = await ctx.db.insert("artifacts", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      artifactType: args.artifactType,
      artifactFamily: artifactFamilyForType(args.artifactType),
      source: "upload",
      title,
      language: defaultLanguageForArtifactType(args.artifactType),
      mimeType: args.mimeType,
      fileName: args.fileName,
      byteSize: args.byteSize,
      indexingStatus: "pending",
      storageId: args.storageId,
      plainTextPreview: "Indexing is running.",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("artifactContents", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      artifactId,
      blocksJson: "",
      markdown: "",
      plainText: "",
      contextText: "",
      createdAt: now,
      updatedAt: now,
    });
    return artifactId;
  },
});

export const promoteAttachmentToWorkspaceInternal = internalMutation({
  args: {
    ownerUserId: v.string(),
    ownerEmail: v.optional(v.string()),
    artifactId: v.id("artifacts"),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await assertThreadAttachmentOwner(ctx, args.artifactId, args.ownerUserId, {
      requireActive: true,
    });
    await assertWorkspaceOwner(ctx, args.workspaceId, args.ownerUserId, {
      requireActive: true,
    });
    await assertLibraryCapacityForOwner(ctx, args.ownerUserId, args.ownerEmail);
    const row = await getContentRow(ctx, args.artifactId, args.ownerUserId);
    const artifactBeforePromote = await ctx.db.get("artifacts", args.artifactId);
    const now = Date.now();
    await ctx.db.patch("artifacts", args.artifactId, {
      workspaceId: args.workspaceId,
      threadId: undefined,
      updatedAt: now,
    });
    await ctx.db.patch("artifactContents", row._id, {
      workspaceId: args.workspaceId,
      threadId: undefined,
      updatedAt: now,
    });
    const workspace = await ctx.db.get("workspaces", args.workspaceId);
    return {
      workspaceId: args.workspaceId,
      artifactId: args.artifactId,
      workspaceName: workspace?.name ?? "Workspace",
      ragEntryId: artifactBeforePromote?.ragEntryId,
      title: artifactBeforePromote?.title ?? "Artifact",
      plainText: row.plainText ?? row.contextText ?? "",
    };
  },
});

export const saveAttachmentToWorkspace = mutation({
  args: {
    artifactId: v.id("artifacts"),
    workspaceId: v.optional(v.id("workspaces")),
  },
  returns: v.object({
    workspaceId: v.id("workspaces"),
    artifactId: v.id("artifacts"),
    workspaceName: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await ctx.db.get("artifacts", args.artifactId);
    if (!artifact || artifact.ownerUserId !== user._id) {
      throwAppError({
        message: "Attachment not found",
        code: "attachment_not_found",
      });
    }
    if (artifact.workspaceId) {
      const workspace = await ctx.db.get("workspaces", artifact.workspaceId);
      return {
        workspaceId: artifact.workspaceId,
        artifactId: artifact._id,
        workspaceName: workspace?.name ?? "Workspace",
      };
    }
    await assertThreadAttachmentOwner(ctx, args.artifactId, user._id, {
      requireActive: true,
    });

    // The thread's "filed under" workspace now lives on the first-party
    // chatThreads table (threadMetadata was retired in the v1→v2 cleanup).
    const boundThread = artifact.threadId
      ? await ctx.db
          .query("chatThreads")
          .withIndex("by_thread_id", (q) => q.eq("threadId", artifact.threadId!))
          .unique()
      : null;
    const boundWorkspaceId =
      boundThread?.ownerUserId === user._id
        ? boundThread.workspaceId
        : undefined;

    let targetWorkspaceId = boundWorkspaceId ?? args.workspaceId;
    if (!targetWorkspaceId) {
      const activeWorkspaces = await ctx.db
        .query("workspaces")
        .withIndex("by_owner_status_updated", (q) =>
          q.eq("ownerUserId", user._id).eq("status", "active"),
        )
        .take(2);
      if (activeWorkspaces.length === 0) {
        await assertWorkspaceCapacity(ctx, user._id);
        const now = Date.now();
        targetWorkspaceId = await ctx.db.insert("workspaces", {
          ownerUserId: user._id,
          name: normalizeName(artifact.title, "Workspace name"),
          emoji: workspaceEmojiForNewWorkspace({
            ownerUserId: user._id,
            name: artifact.title,
            now,
          }),
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
      } else if (activeWorkspaces.length === 1) {
        targetWorkspaceId = activeWorkspaces[0]._id;
      } else {
        throwAppError({
          message: "Choose a workspace to save this attachment",
          code: "attachment_workspace_required",
          field: "workspaceId",
        });
      }
    }

    if (boundWorkspaceId && args.workspaceId && args.workspaceId !== boundWorkspaceId) {
      throwAppError({
        message: "Attachment must be saved to the bound workspace",
        code: "attachment_workspace_mismatch",
        field: "workspaceId",
      });
    }

    const promoted = await ctx.runMutation(
      internal.artifacts.promoteAttachmentToWorkspaceInternal,
      {
        ownerUserId: user._id,
        ownerEmail: user.email ?? undefined,
        artifactId: args.artifactId,
        workspaceId: targetWorkspaceId,
      },
    ) as {
      workspaceId: Id<"workspaces">;
      artifactId: Id<"artifacts">;
      workspaceName: string;
      ragEntryId?: string;
      title: string;
      plainText: string;
    };

    if (promoted.plainText.trim()) {
      await ctx.scheduler.runAfter(0, internal.artifacts.uploads.reindexPromotedAttachment, {
        ownerUserId: user._id,
        artifactId: promoted.artifactId,
        workspaceId: promoted.workspaceId,
        title: promoted.title,
        plainText: promoted.plainText,
        previousRagEntryId: promoted.ragEntryId,
      });
    }

    return {
      workspaceId: promoted.workspaceId,
      artifactId: promoted.artifactId,
      workspaceName: promoted.workspaceName,
    };
  },
});

export const createUploadedArtifactInternal = internalMutation({
  args: {
    ownerUserId: v.string(),
    ownerEmail: v.optional(v.string()),
    workspaceId: v.id("workspaces"),
    folderId: v.optional(v.id("workspaceFolders")),
    title: v.string(),
    artifactType: artifactTypeValidator,
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    byteSize: v.number(),
  },
  handler: async (ctx, args) => {
    await assertWorkspaceOwner(ctx, args.workspaceId, args.ownerUserId, {
      requireActive: true,
    });
    if (args.folderId) {
      await assertFolderOwner(ctx, args.folderId, args.ownerUserId, args.workspaceId);
    }
    await assertLibraryCapacityForOwner(ctx, args.ownerUserId, args.ownerEmail);
    const now = Date.now();
    const title = normalizeName(args.title, "Artifact title");
    const artifactId = await ctx.db.insert("artifacts", {
      ownerUserId: args.ownerUserId,
      workspaceId: args.workspaceId,
      folderId: args.folderId,
      artifactType: args.artifactType,
      artifactFamily: artifactFamilyForType(args.artifactType),
      source: "upload",
      title,
      language: defaultLanguageForArtifactType(args.artifactType),
      mimeType: args.mimeType,
      fileName: args.fileName,
      byteSize: args.byteSize,
      indexingStatus: "pending",
      storageId: args.storageId,
      plainTextPreview: "Indexing is running.",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("artifactContents", {
      ownerUserId: args.ownerUserId,
      workspaceId: args.workspaceId,
      artifactId,
      blocksJson: "",
      markdown: "",
      plainText: "",
      contextText: "",
      createdAt: now,
      updatedAt: now,
    });
    return artifactId;
  },
});

export const patchUploadedArtifactIndexed = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    markdown: v.string(),
    plainText: v.string(),
    indexedTextStorageId: v.optional(v.id("_storage")),
    markdownStorageId: v.optional(v.id("_storage")),
    ragEntryId: v.optional(v.string()),
    title: v.optional(v.string()),
    detectedDocumentKind: v.optional(detectedDocumentKindValidator),
    plainTextPreview: v.optional(v.string()),
    contextText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const artifact = await assertUploadedArtifactOwner(ctx, args.artifactId, args.ownerUserId, {
      requireActive: true,
    });
    const row = await getContentRow(ctx, args.artifactId, args.ownerUserId);
    const now = Date.now();
    const inlinePlainText =
      args.plainText.length <= ARTIFACT_BODY_INLINE_LIMIT ? args.plainText : undefined;
    const inlineMarkdown =
      args.markdown.length <= ARTIFACT_BODY_INLINE_LIMIT ? args.markdown : undefined;
    await ctx.db.patch("artifacts", artifact._id, {
      title: args.title ?? artifact.title,
      // Preserve an existing classification (e.g. set during URL→PDF convert)
      // when the caller doesn't provide one, instead of clearing it.
      detectedDocumentKind: args.detectedDocumentKind ?? artifact.detectedDocumentKind,
      plainTextPreview: args.plainTextPreview ?? previewFromText(args.plainText),
      indexingStatus: "ready",
      indexingFailureReason: undefined,
      ragEntryId: args.ragEntryId ?? artifact.ragEntryId,
      indexedAt: args.ragEntryId ? now : artifact.indexedAt,
      updatedAt: now,
    });
    await ctx.db.patch("artifactContents", row._id, {
      markdown: inlineMarkdown,
      plainText: inlinePlainText,
      contextText: args.contextText ?? contextFromText(args.plainText),
      storageId: args.indexedTextStorageId,
      markdownStorageId: args.markdownStorageId,
      updatedAt: now,
    });
  },
});

export const patchUploadedArtifactIndexingFailed = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    failureReason: v.string(),
  },
  handler: async (ctx, args) => {
    await assertUploadedArtifactOwner(ctx, args.artifactId, args.ownerUserId, {
      requireActive: true,
    });
    const reason = previewFromText(args.failureReason, 500);
    await ctx.db.patch("artifacts", args.artifactId, {
      plainTextPreview: reason,
      indexingStatus: "failed",
      indexingFailureReason: reason,
      updatedAt: Date.now(),
    });
  },
});

export const getContentTarget = internalQuery({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
  },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get("artifacts", args.artifactId);
    if (
      !artifact ||
      artifact.ownerUserId !== args.ownerUserId ||
      artifact.status !== "active"
    ) {
      return null;
    }
    // NOTE: a non-null workspaceId is intentionally NOT required. Chat-attached
    // documents ("Lampiran chat") are thread-scoped and have workspaceId === null,
    // yet their extracted text lives in artifactContents just like workspace docs.
    // The ownership + active-status checks above are the security boundary; the old
    // workspaceId guard wrongly made verifyCitations / verifyStatistics / the
    // artifact viewer report "no text" for any chat attachment.
    const artifactType = artifactTypeForLegacyArtifact(artifact);
    const [content, url] = await Promise.all([
      getContentRowOrNull(ctx, artifact._id, args.ownerUserId),
      artifactType === "url"
        ? getUrlRowOrNull(ctx, artifact._id, args.ownerUserId)
        : Promise.resolve(null),
    ]);
    return { artifact, content, url };
  },
});

export const getUrlExtractionTarget = internalQuery({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get("artifacts", args.artifactId);
    if (!artifact || !artifact.workspaceId || artifact.status !== "active") {
      return null;
    }
    if (artifactTypeForLegacyArtifact(artifact) !== "url") {
      return null;
    }
    const row = await getUrlRow(ctx, args.artifactId, artifact.ownerUserId);
    return {
      ownerUserId: artifact.ownerUserId,
      artifactId: artifact._id,
      workspaceId: artifact.workspaceId,
      title: artifact.title,
      originalUrl: row.originalUrl,
      normalizedUrl: row.normalizedUrl,
      siteName: row.siteName ?? siteNameFromUrl(row.normalizedUrl),
    };
  },
});

export const patchUrlExtractionReady = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    title: v.string(),
    description: v.optional(v.string()),
    siteName: v.optional(v.string()),
    readableText: v.string(),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const artifact = await assertUploadedArtifactOwner(ctx, args.artifactId, args.ownerUserId, {
      requireActive: true,
    });
    const row = await getUrlRow(ctx, args.artifactId, args.ownerUserId);
    const now = Date.now();
    const inlineText =
      args.readableText.length <= ARTIFACT_BODY_INLINE_LIMIT ? args.readableText : undefined;
    await ctx.db.patch("artifacts", artifact._id, {
      title: args.title || artifact.title,
      plainTextPreview: previewFromText(args.readableText),
      indexingStatus: "ready",
      indexingFailureReason: undefined,
      updatedAt: now,
    });
    await ctx.db.patch("artifactUrls", row._id, {
      status: "ready",
      title: args.title,
      description: args.description,
      siteName: args.siteName ?? siteNameFromUrl(row.normalizedUrl),
      readableText: inlineText,
      contextText: contextFromText(args.readableText),
      storageId: args.storageId,
      failureReason: undefined,
      extractedAt: now,
      updatedAt: now,
    });
  },
});

export const patchUrlExtractionFailed = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    failureReason: v.string(),
  },
  handler: async (ctx, args) => {
    await assertWorkspaceArtifactOwner(ctx, args.artifactId, args.ownerUserId, {
      requireActive: true,
    });
    const row = await getUrlRow(ctx, args.artifactId, args.ownerUserId);
    const reason = previewFromText(args.failureReason, 500);
    await ctx.db.patch("artifacts", args.artifactId, {
      indexingStatus: "failed",
      indexingFailureReason: reason,
      updatedAt: Date.now(),
    });
    await ctx.db.patch("artifactUrls", row._id, {
      status: "failed",
      failureReason: reason,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Convert a `url` artifact into a `pdf` artifact after an open-access PDF has
 * been downloaded for it (academic ingestion path). The artifact then flows
 * through the SAME extraction/GROBID pipeline as an uploaded PDF. The original
 * `artifactUrls` row is kept (marked ready) so URL-level dedupe still works.
 */
export const convertUrlArtifactToPdf = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    byteSize: v.number(),
    title: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const artifact = await assertUploadedArtifactOwner(ctx, args.artifactId, args.ownerUserId, {
      requireActive: true,
    });
    if (!artifact.workspaceId) {
      return { ok: false };
    }
    const now = Date.now();
    await ctx.db.patch("artifacts", args.artifactId, {
      artifactType: "pdf",
      artifactFamily: artifactFamilyForType("pdf"),
      mimeType: "application/pdf",
      fileName: args.fileName,
      byteSize: args.byteSize,
      storageId: args.storageId,
      language: defaultLanguageForArtifactType("pdf"),
      detectedDocumentKind: "scholarly_paper",
      indexingStatus: "pending",
      indexingFailureReason: undefined,
      plainTextPreview: "Indexing is running.",
      title: args.title ? normalizeName(args.title, "Artifact title") : artifact.title,
      updatedAt: now,
    });
    // URL artifacts don't create a content row; the upload pipeline needs one.
    const existingContent = await getContentRowOrNull(ctx, args.artifactId, args.ownerUserId);
    if (!existingContent) {
      await ctx.db.insert("artifactContents", {
        ownerUserId: args.ownerUserId,
        workspaceId: artifact.workspaceId,
        artifactId: args.artifactId,
        blocksJson: "",
        markdown: "",
        plainText: "",
        contextText: "",
        createdAt: now,
        updatedAt: now,
      });
    }
    const urlRow = await getUrlRowOrNull(ctx, args.artifactId, args.ownerUserId);
    if (urlRow) {
      await ctx.db.patch("artifactUrls", urlRow._id, {
        status: "ready",
        failureReason: undefined,
        extractedAt: now,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

/**
 * Mark a `url` artifact as a scholarly paper for which no open-access PDF could
 * be downloaded. Keeps it a `url` artifact but flips `detectedDocumentKind` so
 * the resolved metadata (abstract/authors/DOI) renders in the paper sidebar.
 */
export const markUrlPaperMetadataOnly = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    title: v.string(),
    abstract: v.optional(v.string()),
    siteName: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const artifact = await assertUploadedArtifactOwner(ctx, args.artifactId, args.ownerUserId, {
      requireActive: true,
    });
    const now = Date.now();
    const readable = args.abstract ?? "";
    await ctx.db.patch("artifacts", artifact._id, {
      title: args.title || artifact.title,
      detectedDocumentKind: "scholarly_paper",
      indexingStatus: "ready",
      indexingFailureReason: undefined,
      plainTextPreview: previewFromText(readable || artifact.title),
      updatedAt: now,
    });
    const row = await getUrlRowOrNull(ctx, args.artifactId, args.ownerUserId);
    if (row) {
      const inline =
        readable.length <= ARTIFACT_BODY_INLINE_LIMIT ? readable : undefined;
      await ctx.db.patch("artifactUrls", row._id, {
        status: "ready",
        title: args.title,
        description: args.abstract ? previewFromText(args.abstract, 280) : undefined,
        siteName: args.siteName ?? row.siteName,
        readableText: inline,
        contextText: contextFromText(readable),
        failureReason: undefined,
        extractedAt: now,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

export const createArtifactFromAgentInternal = internalMutation({
  args: {
    ownerUserId: v.string(),
    workspaceId: v.id("workspaces"),
    folderId: v.optional(v.id("workspaceFolders")),
    title: v.string(),
    artifactType: generatedArtifactTypeValidator,
    content: v.string(),
    plainText: v.string(),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertWorkspaceOwner(ctx, args.workspaceId, args.ownerUserId, { requireActive: true });
    if (args.folderId) {
      await assertFolderOwner(ctx, args.folderId, args.ownerUserId, args.workspaceId);
    }
    await assertLibraryCapacityForOwner(ctx, args.ownerUserId);
    const artifactType = artifactTypeFromAgentInput(args.artifactType);
    const now = Date.now();
    const title = normalizeName(args.title, "Artifact title");
    const plainText = normalizeGeneratedPlainText(artifactType, args.content, args.plainText);
    assertGeneratedArtifactFitsInline(args.content, plainText);
    const artifactId = await ctx.db.insert("artifacts", {
      ownerUserId: args.ownerUserId,
      workspaceId: args.workspaceId,
      folderId: args.folderId,
      artifactType,
      artifactFamily: artifactFamilyForType(artifactType),
      source: "agent",
      title,
      language: args.language ?? defaultLanguageForArtifactType(artifactType),
      indexingStatus: "ready",
      plainTextPreview: previewFromText(plainText || args.content),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("artifactContents", {
      ownerUserId: args.ownerUserId,
      workspaceId: args.workspaceId,
      artifactId,
      blocksJson: "",
      markdown: artifactType === "markdown" ? args.content : "",
      plainText,
      contextText: contextFromText(plainText || args.content),
      createdAt: now,
      updatedAt: now,
    });
    return artifactId;
  },
});

export const updateArtifactFromAgentInternal = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    title: v.optional(v.string()),
    artifactType: generatedArtifactTypeValidator,
    content: v.string(),
    plainText: v.string(),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const artifact = await assertWorkspaceArtifactOwner(ctx, args.artifactId, args.ownerUserId, {
      requireActive: true,
    });
    await assertWorkspaceOwner(ctx, artifact.workspaceId, args.ownerUserId, { requireActive: true });
    const artifactType = artifactTypeFromAgentInput(args.artifactType);
    if (!isAgentWritableArtifactType(artifactTypeForLegacyArtifact(artifact))) {
      throwAppError({
        message: "Uploaded file artifacts cannot be overwritten by generated text",
        code: "artifact_not_overwritable",
      });
    }
    const row = await getContentRow(ctx, args.artifactId, args.ownerUserId);
    const now = Date.now();
    const title = args.title ? normalizeName(args.title, "Artifact title") : artifact.title;
    const plainText = normalizeGeneratedPlainText(artifactType, args.content, args.plainText);
    assertGeneratedArtifactFitsInline(args.content, plainText);
    await ctx.db.patch("artifacts", artifact._id, {
      artifactType,
      artifactFamily: artifactFamilyForType(artifactType),
      title,
      language: args.language ?? defaultLanguageForArtifactType(artifactType),
      storageId: undefined,
      plainTextPreview: previewFromText(plainText || args.content),
      indexingStatus: "ready",
      updatedAt: now,
    });
    await ctx.db.patch("artifactContents", row._id, {
      blocksJson: artifactType === "markdown" ? "" : undefined,
      markdown: artifactType === "markdown" ? args.content : "",
      plainText,
      contextText: contextFromText(plainText || args.content),
      storageId: undefined,
      markdownStorageId: undefined,
      blocksStorageId: undefined,
      updatedAt: now,
    });
    return { ok: true as const };
  },
});

export const deleteArtifactFromAgentInternal = internalMutation({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
  },
  handler: async (ctx, args) => {
    const artifact = await assertWorkspaceArtifactOwner(ctx, args.artifactId, args.ownerUserId, {
      requireActive: true,
    });
    await assertWorkspaceOwner(ctx, artifact.workspaceId, args.ownerUserId, { requireActive: true });
    const now = Date.now();
    await ctx.db.patch("artifacts", args.artifactId, {
      status: "deleted",
      deletedAt: now,
      updatedAt: now,
    });
    return { ok: true as const };
  },
});

async function assertLibraryCapacity(ctx: MutationCtx, ownerUserId: string) {
  const user = await requireCurrentUser(ctx);
  await assertLibraryCapacityForOwner(ctx, ownerUserId, user.email);
}

async function assertLibraryCapacityForOwner(
  ctx: MutationCtx,
  ownerUserId: string,
  ownerEmail?: string | null,
) {
  const snapshot = await getBillingSnapshot(ctx, ownerUserId, ownerEmail);
  const limit = PLAN_CATALOG[snapshot.planKey].libraryItemLimit;
  if (limit === Number.MAX_SAFE_INTEGER) {
    return;
  }
  const activeArtifacts = await ctx.db
    .query("artifacts")
    .withIndex("by_owner_status_updated", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("status", "active"),
    )
    .take(limit + 1);
  if (activeArtifacts.length >= limit) {
    throwAppError({
      message: "Library item limit reached for current plan",
      code: "library_item_limit_reached",
      severity: "warning",
    });
  }
}

async function assertWorkspaceCapacity(ctx: MutationCtx, ownerUserId: string) {
  const user = await requireCurrentUser(ctx);
  const snapshot = await getBillingSnapshot(ctx, ownerUserId, user.email);
  const limit = PLAN_CATALOG[snapshot.planKey].workspaceLimit;
  if (limit === Number.MAX_SAFE_INTEGER) {
    return;
  }
  const activeWorkspaces = await ctx.db
    .query("workspaces")
    .withIndex("by_owner_status_updated", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("status", "active"),
    )
    .take(limit + 1);
  if (activeWorkspaces.length >= limit) {
    throwAppError({
      message: "Workspace limit reached for current plan",
      code: "workspace_limit_reached",
      severity: "warning",
    });
  }
}

async function getContentRow(
  ctx: QueryCtx | MutationCtx,
  artifactId: Id<"artifacts">,
  ownerUserId: string,
) {
  const row = await getContentRowOrNull(ctx, artifactId, ownerUserId);
  if (!row) {
    throwAppError({
      message: "Artifact content not found",
      code: "artifact_content_not_found",
    });
  }
  return row;
}

async function getContentRowOrNull(
  ctx: QueryCtx | MutationCtx,
  artifactId: Id<"artifacts">,
  ownerUserId: string,
) {
  return await ctx.db
    .query("artifactContents")
    .withIndex("by_owner_artifact", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("artifactId", artifactId),
    )
    .unique();
}

async function getUrlRow(
  ctx: QueryCtx | MutationCtx,
  artifactId: Id<"artifacts">,
  ownerUserId: string,
) {
  const row = await getUrlRowOrNull(ctx, artifactId, ownerUserId);
  if (!row) {
    throwAppError({
      message: "URL artifact not found",
      code: "artifact_url_not_found",
    });
  }
  return row;
}

async function getUrlRowOrNull(
  ctx: QueryCtx | MutationCtx,
  artifactId: Id<"artifacts">,
  ownerUserId: string,
) {
  return await ctx.db
    .query("artifactUrls")
    .withIndex("by_owner_artifact", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("artifactId", artifactId),
    )
    .unique();
}

async function storeOversizedText(
  ctx: ActionCtx,
  value: string,
  type: string,
) {
  if (value.length <= ARTIFACT_BODY_INLINE_LIMIT) {
    return undefined;
  }
  return await ctx.storage.store(new Blob([value], { type }));
}

async function readStorageText(ctx: ActionCtx, storageId: Id<"_storage">) {
  const blob = await ctx.storage.get(storageId);
  return blob ? await blob.text() : "";
}

function normalizeGeneratedPlainText(
  artifactType: ArtifactType,
  content: string,
  plainText: string,
) {
  if (plainText.trim()) {
    return plainText;
  }
  if (artifactType === "markdown") {
    return plainTextFromMarkdown(content);
  }
  return content;
}

function assertGeneratedArtifactFitsInline(content: string, plainText: string) {
  if (
    content.length > ARTIFACT_BODY_INLINE_LIMIT ||
    plainText.length > ARTIFACT_BODY_INLINE_LIMIT
  ) {
    throwAppError({
      message: "Generated artifact is too large to save inline",
      code: "artifact_too_large_inline",
      severity: "warning",
    });
  }
}
