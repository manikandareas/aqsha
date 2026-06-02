"use node";

import { ConvexError, v } from "convex/values";
import mammoth from "mammoth";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { requireCurrentUser } from "./auth";
import {
  artifactRag,
  artifactRagNamespace,
  type ArtifactRagMetadata,
} from "./agent/rag";
import { embeddingProviderConfig } from "./agent/providers";
import { artifactTypeFromUpload } from "./artifactModel";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "./artifactUploadLimits";
const MAX_INDEXED_TEXT_CHARS = 300_000;

const textLikeMimeTypes = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/json",
]);

const pendingAttachmentValidator = v.object({
  storageId: v.id("_storage"),
  fileName: v.string(),
  mimeType: v.string(),
  size: v.number(),
});

type ExtractedDocument = {
  markdown: string;
  plainText: string;
};

type ProcessedAttachment = {
  artifactId: Id<"artifacts">;
  title: string;
  artifactType: string;
};

export const createFromStorage = action({
  args: {
    workspaceId: v.id("workspaces"),
    folderId: v.optional(v.id("workspaceFolders")),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args): Promise<{
    artifactId: Id<"artifacts">;
    title: string;
    indexed: boolean;
  }> => {
    const user = await requireCurrentUser(ctx);
    validateUpload(args);
    const title = titleFromFileName(args.fileName);
    const artifactType = artifactTypeFromUpload({
      fileName: args.fileName,
      mimeType: args.mimeType || "application/octet-stream",
    });
    const artifactId: Id<"artifacts"> = await ctx.runMutation(
      internal.artifacts.createUploadedArtifactInternal,
      {
        ownerUserId: user._id,
        ownerEmail: user.email ?? undefined,
        workspaceId: args.workspaceId,
        folderId: args.folderId,
        title,
        artifactType,
        storageId: args.storageId,
        fileName: args.fileName,
        mimeType: args.mimeType || "application/octet-stream",
        byteSize: args.size,
      },
    );

    return await finalizeUploadedDocument(ctx, {
      ownerUserId: user._id,
      artifactId,
      title,
      storageId: args.storageId,
      fileName: args.fileName,
      mimeType: args.mimeType,
      workspaceId: args.workspaceId,
    });
  },
});

export const createThreadAttachmentFromStorage = action({
  args: {
    threadId: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args): Promise<{
    artifactId: Id<"artifacts">;
    title: string;
    indexed: boolean;
  }> => {
    const user = await requireCurrentUser(ctx);
    validateUpload(args);
    const title = titleFromFileName(args.fileName);
    const artifactType = artifactTypeFromUpload({
      fileName: args.fileName,
      mimeType: args.mimeType || "application/octet-stream",
    });
    const artifactId: Id<"artifacts"> = await ctx.runMutation(
      internal.artifacts.createThreadAttachmentInternal,
      {
        ownerUserId: user._id,
        threadId: args.threadId,
        title,
        artifactType,
        storageId: args.storageId,
        fileName: args.fileName,
        mimeType: args.mimeType || "application/octet-stream",
        byteSize: args.size,
      },
    );

    return await finalizeUploadedDocument(ctx, {
      ownerUserId: user._id,
      artifactId,
      title,
      storageId: args.storageId,
      fileName: args.fileName,
      mimeType: args.mimeType,
      threadId: args.threadId,
    });
  },
});

export const reindexCurrentUserUpload = action({
  args: {
    artifactId: v.id("artifacts"),
  },
  handler: async (ctx, args): Promise<{ indexed: boolean; ragEntryId?: string }> => {
    const user = await requireCurrentUser(ctx);
    const artifact = await ctx.runQuery(internal.artifacts.getOwnedArtifactForReindex, {
      ownerUserId: user._id,
      artifactId: args.artifactId,
    });
    if (!artifact) {
      throw new ConvexError("Artifact not found");
    }
    if (artifact.source !== "upload") {
      throw new ConvexError("Only uploaded artifacts can be reindexed");
    }

    const content = await ctx.runQuery(internal.artifacts.getArtifactContentForReindex, {
      ownerUserId: user._id,
      artifactId: args.artifactId,
    });
    const plainText = content?.plainText ?? content?.contextText ?? content?.markdown ?? "";
    if (!plainText.trim()) {
      throw new ConvexError("No readable text was found for this artifact");
    }

    const ragEntryId = await indexUploadedDocument(ctx, {
      ownerUserId: user._id,
      workspaceId: artifact.workspaceId,
      threadId: artifact.threadId,
      artifactId: artifact._id,
      title: artifact.title,
      plainText,
    });

    await ctx.runMutation(internal.artifacts.patchUploadedArtifactIndexed, {
      ownerUserId: user._id,
      artifactId: artifact._id,
      markdown: content?.markdown ?? plainText,
      plainText,
      ragEntryId,
    });

    return { indexed: Boolean(ragEntryId), ragEntryId };
  },
});

export const processPendingAttachmentsAndStart = internalAction({
  args: {
    ownerUserId: v.string(),
    ownerEmail: v.optional(v.string()),
    threadId: v.string(),
    messageId: v.string(),
    threadTitle: v.optional(v.string()),
    content: v.string(),
    mode: v.union(v.literal("normal"), v.literal("deep")),
    commandId: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    pendingAttachments: v.array(pendingAttachmentValidator),
    selectedContextArtifactIds: v.optional(v.array(v.id("artifacts"))),
    contextArtifactSnapshot: v.optional(
      v.array(
        v.object({
          artifactId: v.id("artifacts"),
          title: v.string(),
          artifactType: v.optional(v.string()),
          source: v.optional(v.union(v.literal("upload"), v.literal("workspace"))),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const processed: ProcessedAttachment[] = [];
    for (const pending of args.pendingAttachments) {
      validateUpload(pending);
      const title = titleFromFileName(pending.fileName);
      const artifactType = artifactTypeFromUpload({
        fileName: pending.fileName,
        mimeType: pending.mimeType || "application/octet-stream",
      });
      const artifactId: Id<"artifacts"> = await ctx.runMutation(
        internal.artifacts.createThreadAttachmentInternal,
        {
          ownerUserId: args.ownerUserId,
          threadId: args.threadId,
          title,
          artifactType,
          storageId: pending.storageId,
          fileName: pending.fileName,
          mimeType: pending.mimeType || "application/octet-stream",
          byteSize: pending.size,
        },
      );
      await finalizeUploadedDocument(ctx, {
        ownerUserId: args.ownerUserId,
        artifactId,
        title,
        storageId: pending.storageId,
        fileName: pending.fileName,
        mimeType: pending.mimeType,
        threadId: args.threadId,
      });
      processed.push({ artifactId, title, artifactType });
    }

    const uploadedIds = processed.map((item) => item.artifactId);
    const snapshot = buildAttachmentSnapshot(processed, args.contextArtifactSnapshot);

    await ctx.runMutation(internal.agent.messages.completeThreadStartAfterAttachments, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      messageId: args.messageId,
      threadTitle: args.threadTitle,
      content: args.content,
      mode: args.mode,
      commandId: args.commandId,
      workspaceId: args.workspaceId,
      selectedContextArtifactIds: args.selectedContextArtifactIds,
      contextArtifactSnapshot: snapshot,
      messageAttachmentArtifactIds: uploadedIds,
    });
  },
});

export const reindexPromotedAttachment = internalAction({
  args: {
    ownerUserId: v.string(),
    artifactId: v.id("artifacts"),
    workspaceId: v.id("workspaces"),
    title: v.string(),
    plainText: v.string(),
    previousRagEntryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!embeddingProviderConfig.enabled || !args.plainText.trim()) {
      return;
    }
    try {
      const result = await artifactRag.add(ctx, {
        namespace: artifactRagNamespace(args.ownerUserId),
        key: `artifact:${args.artifactId}`,
        title: args.title,
        text: args.plainText.slice(0, MAX_INDEXED_TEXT_CHARS),
        filterValues: [
          { name: "artifactId", value: String(args.artifactId) },
          { name: "workspaceId", value: String(args.workspaceId) },
        ],
        metadata: {
          artifactId: String(args.artifactId),
          workspaceId: String(args.workspaceId),
          ownerUserId: args.ownerUserId,
          source: "upload",
        } satisfies ArtifactRagMetadata,
      });
      await ctx.runMutation(internal.artifacts.patchUploadedArtifactIndexed, {
        ownerUserId: args.ownerUserId,
        artifactId: args.artifactId,
        markdown: args.plainText,
        plainText: args.plainText,
        ragEntryId: String(result.entryId),
      });
    } catch (error) {
      console.warn("Failed to reindex promoted attachment", error);
    }
  },
});

function buildAttachmentSnapshot(
  processed: ProcessedAttachment[],
  existing?: Array<{
    artifactId: Id<"artifacts">;
    title: string;
    artifactType?: string;
    source?: "upload" | "workspace";
  }>,
) {
  const uploadedSnapshot = processed.map((item) => ({
    artifactId: item.artifactId,
    title: item.title,
    artifactType: item.artifactType,
    source: "upload" as const,
  }));
  const merged = [...(existing ?? []), ...uploadedSnapshot];
  if (merged.length === 0) {
    return undefined;
  }
  const seen = new Set<string>();
  return merged.filter((item) => {
    const key = String(item.artifactId);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function finalizeUploadedDocument(
  ctx: ActionCtx,
  args: {
    ownerUserId: string;
    artifactId: Id<"artifacts">;
    title: string;
    storageId: Id<"_storage">;
    fileName: string;
    mimeType: string;
    workspaceId?: Id<"workspaces">;
    threadId?: string;
  },
): Promise<{ artifactId: Id<"artifacts">; title: string; indexed: boolean }> {
  try {
    const extracted = await extractStoredDocument(ctx, {
      storageId: args.storageId,
      fileName: args.fileName,
      mimeType: args.mimeType,
    });
    if (!extracted.plainText.trim()) {
      throw new ConvexError("No readable text was found in this file");
    }

    const [indexedTextStorageId, markdownStorageId] = await Promise.all([
      maybeStoreText(ctx, extracted.plainText, "text/plain"),
      maybeStoreText(ctx, extracted.markdown, "text/markdown"),
    ]);
    const ragEntryId = await indexUploadedDocument(ctx, {
      ownerUserId: args.ownerUserId,
      workspaceId: args.workspaceId,
      threadId: args.threadId,
      artifactId: args.artifactId,
      title: args.title,
      plainText: extracted.plainText,
    });

    await ctx.runMutation(internal.artifacts.patchUploadedArtifactIndexed, {
      ownerUserId: args.ownerUserId,
      artifactId: args.artifactId,
      markdown: extracted.markdown,
      plainText: extracted.plainText,
      indexedTextStorageId,
      markdownStorageId,
      ragEntryId,
    });
    if (args.workspaceId && isPdfFile(args.fileName, args.mimeType)) {
      await ctx.runMutation(internal.paperExtractions.queueGrobidExtraction, {
        ownerUserId: args.ownerUserId,
        artifactId: args.artifactId,
      });
    }

    return { artifactId: args.artifactId, title: args.title, indexed: Boolean(ragEntryId) };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "File indexing failed";
    await ctx.runMutation(internal.artifacts.patchUploadedArtifactIndexingFailed, {
      ownerUserId: args.ownerUserId,
      artifactId: args.artifactId,
      failureReason: message,
    });
    return { artifactId: args.artifactId, title: args.title, indexed: false };
  }
}

function validateUpload(args: {
  fileName: string;
  mimeType: string;
  size: number;
}) {
  if (!args.fileName.trim()) {
    throw new ConvexError("File name is required");
  }
  if (args.size <= 0) {
    throw new ConvexError("File is empty");
  }
  if (args.size > MAX_UPLOAD_BYTES) {
    throw new ConvexError(`File is too large. Maximum upload size is ${MAX_UPLOAD_MB} MB.`);
  }
  if (!isSupportedDocument(args.fileName, args.mimeType)) {
    throw new ConvexError(
      "Unsupported file type. Upload PDF, DOCX, TXT, Markdown, CSV, JSON, HTML, SVG, Mermaid, or code files.",
    );
  }
}

async function extractStoredDocument(
  ctx: ActionCtx,
  args: {
    storageId: Id<"_storage">;
    fileName: string;
    mimeType: string;
  },
): Promise<ExtractedDocument> {
  const blob = await ctx.storage.get(args.storageId);
  if (!blob) {
    throw new ConvexError("Uploaded file was not found");
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const lowerName = args.fileName.toLowerCase();
  const mimeType = args.mimeType.toLowerCase();

  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    return await extractPdf(buffer);
  }
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    const text = normalizeExtractedText(result.value);
    return { markdown: text, plainText: text };
  }
  if (
    textLikeMimeTypes.has(mimeType) ||
    mimeType === "image/svg+xml" ||
    isTextExtractableName(lowerName)
  ) {
    const text = normalizeExtractedText(buffer.toString("utf8"));
    const plainText = lowerName.endsWith(".html") || mimeType === "text/html"
      ? normalizeExtractedText(stripHtml(text))
      : text;
    return { markdown: text, plainText };
  }

  throw new ConvexError("Unsupported file type");
}

async function extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const normalized = normalizeExtractedText(text);
  return { markdown: normalized, plainText: normalized };
}

async function maybeStoreText(
  ctx: ActionCtx,
  value: string,
  type: string,
) {
  if (value.length <= 900_000) {
    return undefined;
  }
  return await ctx.storage.store(new Blob([value], { type }));
}

async function indexUploadedDocument(
  ctx: ActionCtx,
  args: {
    ownerUserId: string;
    workspaceId?: Id<"workspaces">;
    threadId?: string;
    artifactId: Id<"artifacts">;
    title: string;
    plainText: string;
  },
) {
  const indexedText = args.plainText.slice(0, MAX_INDEXED_TEXT_CHARS);
  if (!indexedText.trim() || !embeddingProviderConfig.enabled) {
    return undefined;
  }

  const filterValues: Array<{ name: "artifactId" | "workspaceId"; value: string }> = [
    { name: "artifactId", value: String(args.artifactId) },
    { name: "workspaceId", value: args.workspaceId ? String(args.workspaceId) : "" },
  ];
  const metadata: ArtifactRagMetadata = {
    artifactId: String(args.artifactId),
    workspaceId: args.workspaceId ? String(args.workspaceId) : "",
    ownerUserId: args.ownerUserId,
    source: "upload",
  };

  try {
    const result = await artifactRag.add(ctx, {
      namespace: artifactRagNamespace(args.ownerUserId),
      key: `artifact:${args.artifactId}`,
      title: args.title,
      text: indexedText,
      filterValues,
      metadata,
    });
    return String(result.entryId);
  } catch (error) {
    console.warn("Failed to index uploaded file in RAG", error);
    return undefined;
  }
}

function isSupportedDocument(fileName: string, mimeType: string) {
  const lowerName = fileName.toLowerCase();
  const lowerType = mimeType.toLowerCase();
  return (
    lowerType === "application/pdf" ||
    lowerType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerType === "image/svg+xml" ||
    textLikeMimeTypes.has(lowerType) ||
    lowerName.endsWith(".pdf") ||
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".svg") ||
    lowerName.endsWith(".mmd") ||
    lowerName.endsWith(".mermaid") ||
    isCodeLikeName(lowerName) ||
    isTextLikeName(lowerName)
  );
}

function isPdfFile(fileName: string, mimeType: string) {
  return mimeType.toLowerCase() === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
}

function isTextLikeName(lowerName: string) {
  return [".txt", ".md", ".markdown", ".csv", ".json", ".html", ".htm"].some(
    (extension) => lowerName.endsWith(extension),
  );
}

function isTextExtractableName(lowerName: string) {
  return (
    isTextLikeName(lowerName) ||
    lowerName.endsWith(".svg") ||
    lowerName.endsWith(".mmd") ||
    lowerName.endsWith(".mermaid") ||
    isCodeLikeName(lowerName)
  );
}

function isCodeLikeName(lowerName: string) {
  return [
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".css",
    ".py",
    ".java",
    ".go",
    ".rs",
    ".sql",
    ".sh",
    ".yml",
    ".yaml",
  ].some((extension) => lowerName.endsWith(extension));
}

function titleFromFileName(fileName: string) {
  const cleaned = fileName.replace(/\s+/g, " ").trim();
  const withoutExtension = cleaned.replace(/\.[^.]+$/, "");
  return (withoutExtension || cleaned || "Uploaded artifact").slice(0, 120);
}

function normalizeExtractedText(value: string) {
  return value
    .replaceAll("\0", "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}
