import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireCurrentUser } from "./auth";
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
} from "./artifactModel";
import {
  assertFolderOwner,
  assertThreadAttachmentOwner,
  assertUploadedArtifactOwner,
  assertWorkspaceArtifactOwner,
  assertWorkspaceOwner,
  normalizeName,
} from "./workspaceAccess";
import { syncArtifactWorkspaceMove } from "./workspaceMoveModel";
import { assertThreadOwner } from "./agent/threads";
import {
  readWithExaContents,
  readWithJinaReader,
  type JinaReadResult,
} from "./agent/externalProviders";

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
  runId?: string;
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
  if (artifact.runId) {
    return "agent";
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
        page: result.page.map(normalizeArtifactReadModel),
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
      page: result.page.map(normalizeArtifactReadModel),
    };
  },
});

export const listForContextPicker = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    if (args.workspaceId) {
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
      return artifacts.map(normalizeArtifactReadModel);
    }

    return (await ctx.db
      .query("artifacts")
      .withIndex("by_owner_status_updated", (q) =>
        q.eq("ownerUserId", user._id).eq("status", "active"),
      )
      .order("desc")
      .take(50))
      .filter((artifact) => artifact.workspaceId != null)
      .map(normalizeArtifactReadModel);
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
      body: "",
      plainTextPreview: "",
      contextText: "",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("artifactDocuments", {
      ownerUserId: user._id,
      workspaceId: args.workspaceId,
      artifactId,
      blocksJson: "",
      markdown: "",
      plainText: "",
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
        (content?.storageId ? await readStorageText(ctx, content.storageId) : artifact.body ?? "");
      return {
        artifactType: "markdown",
        blocksJson,
        markdown,
        plainText,
      };
    }

    const source =
      artifact.body ??
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
      contextText: normalizedUrl,
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
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.artifacts.extractUrl, { artifactId });
    return artifactId;
  },
});

export const retryUrlExtraction = mutation({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await assertWorkspaceArtifactOwner(ctx, args.artifactId, user._id, {
      requireActive: true,
    });
    await assertWorkspaceOwner(ctx, artifact.workspaceId, user._id, { requireActive: true });
    if (artifactTypeForLegacyArtifact(artifact) !== "url") {
      throw new ConvexError("Artifact is not a URL");
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
    await ctx.scheduler.runAfter(0, internal.artifacts.extractUrl, { artifactId: args.artifactId });
    return { ok: true };
  },
});

export const rename = mutation({
  args: {
    artifactId: v.id("artifacts"),
    title: v.string(),
  },
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

export const extractUrl = internalAction({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args): Promise<{ ok: boolean; reason?: string }> => {
    const target = await ctx.runQuery(internal.artifacts.getUrlExtractionTarget, {
      artifactId: args.artifactId,
    });
    if (!target) {
      return { ok: false, reason: "not_found" };
    }

    const exa: JinaReadResult | null = process.env.EXA_API_KEY
      ? await readWithExaContents(ctx, {
          ownerUserId: target.ownerUserId,
          url: target.normalizedUrl,
        })
      : null;
    const read: JinaReadResult = exa?.ok
      ? exa
      : await readWithJinaReader(ctx, {
          ownerUserId: target.ownerUserId,
          url: target.normalizedUrl,
        });

    if (!read.ok) {
      await ctx.runMutation(internal.artifacts.patchUrlExtractionFailed, {
        artifactId: args.artifactId,
        ownerUserId: target.ownerUserId,
        failureReason: read.failureReason ?? "URL extraction failed",
      });
      return { ok: false, reason: read.failureReason ?? "URL extraction failed" };
    }

    const storageId =
      read.markdown.length > ARTIFACT_BODY_INLINE_LIMIT
        ? await ctx.storage.store(new Blob([read.markdown], { type: "text/markdown" }))
        : undefined;
    await ctx.runMutation(internal.artifacts.patchUrlExtractionReady, {
      artifactId: args.artifactId,
      ownerUserId: target.ownerUserId,
      title: read.title || target.title,
      description: read.snippet || undefined,
      siteName: target.siteName,
      readableText: read.markdown,
      storageId,
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
      throw new ConvexError("Artifact is not editable Markdown");
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
      body: inlinePlainText,
      plainTextPreview: previewFromText(args.plainText),
      contextText: contextFromText(args.plainText),
      indexingStatus: "ready",
      updatedAt: now,
    });
    await ctx.db.patch("artifactDocuments", row._id, {
      blocksJson: inlineBlocksJson,
      markdown: inlineMarkdown,
      plainText: inlinePlainText,
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
      contextText: "",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("artifactDocuments", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      artifactId,
      blocksJson: "",
      markdown: "",
      plainText: "",
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
    await ctx.db.patch("artifactDocuments", row._id, {
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
      plainText: row.plainText ?? artifactBeforePromote?.contextText ?? "",
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
      throw new ConvexError("Attachment not found");
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

    const threadMetadata = artifact.threadId
      ? await ctx.db
          .query("threadMetadata")
          .withIndex("by_thread", (q) => q.eq("threadId", artifact.threadId!))
          .unique()
      : null;
    const boundWorkspaceId =
      threadMetadata?.ownerUserId === user._id
        ? threadMetadata.workspaceId
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
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
      } else if (activeWorkspaces.length === 1) {
        targetWorkspaceId = activeWorkspaces[0]._id;
      } else {
        throw new ConvexError("Choose a workspace to save this attachment");
      }
    }

    if (boundWorkspaceId && args.workspaceId && args.workspaceId !== boundWorkspaceId) {
      throw new ConvexError("Attachment must be saved to the bound workspace");
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
      await ctx.scheduler.runAfter(0, internal.artifactUploads.reindexPromotedAttachment, {
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
      contextText: "",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("artifactDocuments", {
      ownerUserId: args.ownerUserId,
      workspaceId: args.workspaceId,
      artifactId,
      blocksJson: "",
      markdown: "",
      plainText: "",
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
      plainTextPreview: previewFromText(args.plainText),
      contextText: contextFromText(args.plainText),
      indexingStatus: "ready",
      indexingFailureReason: undefined,
      ragEntryId: args.ragEntryId,
      indexedAt: args.ragEntryId ? now : undefined,
      updatedAt: now,
    });
    await ctx.db.patch("artifactDocuments", row._id, {
      markdown: inlineMarkdown,
      plainText: inlinePlainText,
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
      contextText: "",
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
      !artifact.workspaceId ||
      artifact.status !== "active"
    ) {
      return null;
    }
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
      title: artifact.title,
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
      contextText: contextFromText(args.readableText),
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
      body: args.content,
      plainTextPreview: previewFromText(plainText || args.content),
      contextText: contextFromText(plainText || args.content),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("artifactDocuments", {
      ownerUserId: args.ownerUserId,
      workspaceId: args.workspaceId,
      artifactId,
      blocksJson: "",
      markdown: artifactType === "markdown" ? args.content : "",
      plainText,
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
      throw new ConvexError("Uploaded file artifacts cannot be overwritten by generated text");
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
      body: args.content,
      storageId: undefined,
      plainTextPreview: previewFromText(plainText || args.content),
      contextText: contextFromText(plainText || args.content),
      indexingStatus: "ready",
      updatedAt: now,
    });
    await ctx.db.patch("artifactDocuments", row._id, {
      blocksJson: artifactType === "markdown" ? "" : undefined,
      markdown: artifactType === "markdown" ? args.content : "",
      plainText,
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
    .collect();
  if (activeArtifacts.length >= limit) {
    throw new ConvexError("Library item limit reached for current plan");
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
    .collect();
  if (activeWorkspaces.length >= limit) {
    throw new ConvexError("Workspace limit reached for current plan");
  }
}

async function getContentRow(
  ctx: QueryCtx | MutationCtx,
  artifactId: Id<"artifacts">,
  ownerUserId: string,
) {
  const row = await getContentRowOrNull(ctx, artifactId, ownerUserId);
  if (!row) {
    throw new ConvexError("Artifact content not found");
  }
  return row;
}

async function getContentRowOrNull(
  ctx: QueryCtx | MutationCtx,
  artifactId: Id<"artifacts">,
  ownerUserId: string,
) {
  return await ctx.db
    .query("artifactDocuments")
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
    throw new ConvexError("URL artifact not found");
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
    throw new ConvexError("Generated artifact is too large to save inline");
  }
}
