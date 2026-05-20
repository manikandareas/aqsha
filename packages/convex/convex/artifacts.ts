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
} from "./_generated/server";
import { requireCurrentUser } from "./auth";
import {
  ARTIFACT_BODY_INLINE_LIMIT,
  contextFromText,
  normalizeUrl,
  previewFromText,
  siteNameFromUrl,
  titleFromUrl,
} from "./artifactModel";
import {
  assertFolderOwner,
  assertWorkspaceArtifactOwner,
  assertWorkspaceOwner,
  normalizeName,
} from "./workspaceAccess";
import {
  readWithExaContents,
  readWithJinaReader,
  type JinaReadResult,
} from "./agent/externalProviders";

const documentTitleFallback = "Untitled document";

type ArtifactFullContent = {
  blocksJson: string;
  markdown: string;
  plainText: string;
  readableText: string;
};

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
      return await ctx.db
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
    }
    return await ctx.db
      .query("artifacts")
      .withIndex("by_owner_workspace_status_updated", (q) =>
        q
          .eq("ownerUserId", user._id)
          .eq("workspaceId", args.workspaceId)
          .eq("status", "active"),
      )
      .order("desc")
      .paginate(args.paginationOpts);
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
      return await ctx.db
        .query("artifacts")
        .withIndex("by_owner_workspace_status_updated", (q) =>
          q
            .eq("ownerUserId", user._id)
            .eq("workspaceId", args.workspaceId)
            .eq("status", "active"),
        )
        .order("desc")
        .take(50);
    }

    return await ctx.db
      .query("artifacts")
      .withIndex("by_owner_status_updated", (q) =>
        q.eq("ownerUserId", user._id).eq("status", "active"),
      )
      .order("desc")
      .take(50);
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
    const [document, url] = await Promise.all([
      ctx.db
        .query("artifactDocuments")
        .withIndex("by_owner_artifact", (q) =>
          q.eq("ownerUserId", user._id).eq("artifactId", artifact._id),
        )
        .unique(),
      ctx.db
        .query("artifactUrls")
        .withIndex("by_owner_artifact", (q) =>
          q.eq("ownerUserId", user._id).eq("artifactId", artifact._id),
        )
        .unique(),
    ]);
    return { artifact, document, url };
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
    const now = Date.now();
    const title = args.title ? normalizeName(args.title, "Artifact title") : documentTitleFallback;
    const artifactId = await ctx.db.insert("artifacts", {
      ownerUserId: user._id,
      workspaceId: args.workspaceId,
      folderId: args.folderId,
      kind: "document",
      type: "document",
      title,
      contentFormat: "blocks_json",
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
    await ctx.runMutation(internal.artifacts.updateDocumentInternal, {
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

export const getFullContent = action({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args): Promise<ArtifactFullContent | null> => {
    const user = await requireCurrentUser(ctx);
    const target: {
      artifact: {
        kind?: "document" | "url";
        body?: string;
        storageId?: Id<"_storage">;
      };
      document?: {
        blocksJson?: string;
        markdown?: string;
        plainText?: string;
        storageId?: Id<"_storage">;
        blocksStorageId?: Id<"_storage">;
        markdownStorageId?: Id<"_storage">;
      } | null;
      url?: {
        readableText?: string;
        storageId?: Id<"_storage">;
      } | null;
    } | null = await ctx.runQuery(internal.artifacts.getContentTarget, {
      ownerUserId: user._id,
      artifactId: args.artifactId,
    });
    if (!target) {
      return null;
    }
    const blocksJson: string | undefined =
      target.document?.blocksJson ??
      (target.document?.blocksStorageId
        ? await readStorageText(ctx, target.document.blocksStorageId)
        : undefined);
    const markdown: string | undefined =
      target.document?.markdown ??
      (target.document?.markdownStorageId
        ? await readStorageText(ctx, target.document.markdownStorageId)
        : undefined);
    const plainText: string | undefined =
      target.document?.plainText ??
      (target.document?.storageId
        ? await readStorageText(ctx, target.document.storageId)
        : target.artifact.body ??
          (target.artifact.storageId
            ? await readStorageText(ctx, target.artifact.storageId)
            : undefined));
    const readableText: string | undefined =
      target.url?.readableText ??
      (target.url?.storageId ? await readStorageText(ctx, target.url.storageId) : undefined);
    return {
      blocksJson: blocksJson ?? "",
      markdown: markdown ?? "",
      plainText: plainText ?? "",
      readableText: readableText ?? "",
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

    const now = Date.now();
    const title = args.title ? normalizeName(args.title, "Artifact title") : titleFromUrl(normalizedUrl);
    const artifactId = await ctx.db.insert("artifacts", {
      ownerUserId: user._id,
      workspaceId: args.workspaceId,
      folderId: args.folderId,
      kind: "url",
      type: "plain_text",
      title,
      contentFormat: "plain",
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
    if (artifact.kind !== "url") {
      throw new ConvexError("Artifact is not a URL");
    }
    const row = await getUrlRow(ctx, args.artifactId, user._id);
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
    folderId: v.optional(v.id("workspaceFolders")),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await assertWorkspaceArtifactOwner(ctx, args.artifactId, user._id, {
      requireActive: true,
    });
    await assertWorkspaceOwner(ctx, artifact.workspaceId, user._id, { requireActive: true });
    if (args.folderId) {
      await assertFolderOwner(ctx, args.folderId, user._id, artifact.workspaceId);
    }
    await ctx.db.patch("artifacts", args.artifactId, {
      folderId: args.folderId,
      updatedAt: Date.now(),
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
    const target: {
      ownerUserId: string;
      artifactId: Id<"artifacts">;
      title: string;
      normalizedUrl: string;
      siteName: string;
    } | null = await ctx.runQuery(internal.artifacts.getUrlExtractionTarget, {
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

export const updateDocumentInternal = internalMutation({
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
    if (artifact.kind !== "document") {
      throw new ConvexError("Artifact is not a document");
    }
    const row = await getDocumentRow(ctx, args.artifactId, args.ownerUserId);
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
      storageId: args.storageId,
      plainTextPreview: previewFromText(args.plainText),
      contextText: contextFromText(args.plainText),
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
    const [document, url] = await Promise.all([
      ctx.db
        .query("artifactDocuments")
        .withIndex("by_owner_artifact", (q) =>
          q.eq("ownerUserId", args.ownerUserId).eq("artifactId", artifact._id),
        )
        .unique(),
      ctx.db
        .query("artifactUrls")
        .withIndex("by_owner_artifact", (q) =>
          q.eq("ownerUserId", args.ownerUserId).eq("artifactId", artifact._id),
        )
        .unique(),
    ]);
    return { artifact, document, url };
  },
});

export const getUrlExtractionTarget = internalQuery({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get("artifacts", args.artifactId);
    if (!artifact || !artifact.workspaceId || artifact.status !== "active" || artifact.kind !== "url") {
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
    const artifact = await assertWorkspaceArtifactOwner(ctx, args.artifactId, args.ownerUserId, {
      requireActive: true,
    });
    const row = await getUrlRow(ctx, args.artifactId, args.ownerUserId);
    const now = Date.now();
    const inlineText =
      args.readableText.length <= ARTIFACT_BODY_INLINE_LIMIT ? args.readableText : undefined;
    await ctx.db.patch("artifacts", artifact._id, {
      title: args.title || artifact.title,
      body: inlineText,
      storageId: args.storageId,
      plainTextPreview: previewFromText(args.readableText),
      contextText: contextFromText(args.readableText),
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
    await ctx.db.patch("artifactUrls", row._id, {
      status: "failed",
      failureReason: previewFromText(args.failureReason, 500),
      updatedAt: Date.now(),
    });
  },
});

async function getDocumentRow(
  ctx: Parameters<typeof assertWorkspaceArtifactOwner>[0],
  artifactId: Id<"artifacts">,
  ownerUserId: string,
) {
  const row = await ctx.db
    .query("artifactDocuments")
    .withIndex("by_owner_artifact", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("artifactId", artifactId),
    )
    .unique();
  if (!row) {
    throw new ConvexError("Document artifact not found");
  }
  return row;
}

async function getUrlRow(
  ctx: Parameters<typeof assertWorkspaceArtifactOwner>[0],
  artifactId: Id<"artifacts">,
  ownerUserId: string,
) {
  const row = await ctx.db
    .query("artifactUrls")
    .withIndex("by_owner_artifact", (q) =>
      q.eq("ownerUserId", ownerUserId).eq("artifactId", artifactId),
    )
    .unique();
  if (!row) {
    throw new ConvexError("URL artifact not found");
  }
  return row;
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
