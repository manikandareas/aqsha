import { UTApi, UTFile } from "uploadthing/server";
import type { AgentRun, AppendAgentEventInput, ChatScope } from "./store";
import { createHash } from "node:crypto";

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export type ChatArtifactKind = "visual_png";

export interface PngArtifactInput {
  bytes: Uint8Array;
  filename: string;
  title: string;
  altText?: string | null;
  caption?: string | null;
  sourceIds?: string[];
  sourceRefs?: unknown;
  visualSpec?: unknown;
  auditSummary?: string | null;
  messageId?: string | null;
  metadata?: unknown;
}

export interface PngArtifactUploadInput extends PngArtifactInput {
  scope: ChatScope;
  run: Pick<AgentRun, "id" | "chatThreadId">;
}

export interface UploadedPngArtifact {
  fileKey: string;
  url: string;
  name: string;
  size: number;
  contentType: "image/png";
}

export interface PersistChatArtifactInput {
  ownerUserId: string;
  chatThreadId: string;
  runId: string;
  messageId: string | null;
  kind: ChatArtifactKind;
  title: string;
  caption: string | null;
  fileKey: string | null;
  url: string | null;
  contentType: "image/png" | null;
  byteSize: number | null;
  checksum: string | null;
  sourceIds: string[];
  sourceRefs: unknown;
  visualSpec: unknown;
  auditStatus: "pending" | "passed" | "omitted" | "failed";
  auditSummary: string | null;
  failureSummary: string | null;
  developerDetail: unknown;
}

export interface PersistedChatArtifact extends PersistChatArtifactInput {
  id: string;
  createdAt: string;
}

export interface PngArtifactUploadClient {
  uploadPng(input: PngArtifactUploadInput): Promise<UploadedPngArtifact>;
  deletePng(fileKey: string): Promise<void>;
}

export interface PngArtifactPublisherOptions {
  uploadClient: PngArtifactUploadClient;
  persistArtifact: (
    input: PersistChatArtifactInput,
  ) => Promise<PersistedChatArtifact>;
  writeEvent: (
    event: Omit<AppendAgentEventInput, "sequence">,
  ) => Promise<void>;
}

export interface PublishPngArtifactInput {
  scope: ChatScope;
  run: Pick<AgentRun, "id" | "chatThreadId">;
  artifact: PngArtifactInput;
}

export class PngArtifactPublisher {
  constructor(private readonly options: PngArtifactPublisherOptions) {}

  async publish(input: PublishPngArtifactInput): Promise<{
    artifact: PersistedChatArtifact;
    markdown: string;
    upload: UploadedPngArtifact;
  }> {
    assertPng(input.artifact.bytes);

    let upload: UploadedPngArtifact | null = null;
    let artifact: PersistedChatArtifact;

    try {
      upload = await this.options.uploadClient.uploadPng({
        ...input.artifact,
        scope: input.scope,
        run: input.run,
      });

      artifact = await this.options.persistArtifact({
        ownerUserId: input.scope.userId,
        chatThreadId: input.run.chatThreadId,
        runId: input.run.id,
        messageId: normalizeNullableString(input.artifact.messageId),
        kind: "visual_png",
        title: input.artifact.title,
        caption: normalizeNullableString(input.artifact.caption),
        fileKey: upload.fileKey,
        url: upload.url,
        contentType: "image/png",
        byteSize: upload.size,
        checksum: checksumForBytes(input.artifact.bytes),
        sourceIds: input.artifact.sourceIds ?? [],
        sourceRefs: input.artifact.sourceRefs ?? [],
        visualSpec: input.artifact.visualSpec ?? null,
        auditStatus: "passed",
        auditSummary: normalizeNullableString(input.artifact.auditSummary),
        failureSummary: null,
        developerDetail: input.artifact.metadata ?? null,
      });
    } catch (error) {
      if (upload) {
        try {
          await this.options.uploadClient.deletePng(upload.fileKey);
        } catch (cleanupError) {
          await this.options.writeEvent({
            type: "orphan_published_artifact_cleanup_failed",
            scope: "tool",
            status: "failed",
            title: "Orphan artifact cleanup failed",
            summary:
              cleanupError instanceof Error
                ? cleanupError.message
                : "Unable to clean up the published PNG after artifact persistence failed.",
            toolName: "publishPngArtifact",
            payload: {
              fileKey: upload.fileKey,
              url: upload.url,
              filename: input.artifact.filename,
              contentType: "image/png",
              title: input.artifact.title,
            },
          });
        }
      }

      await this.options.writeEvent({
        type: "artifact_upload_failed",
        scope: "tool",
        status: "failed",
        title: "Artifact upload failed",
        summary:
          error instanceof Error
            ? error.message
            : "Unable to upload the PNG artifact.",
        toolName: "publishPngArtifact",
        payload: {
          filename: input.artifact.filename,
          contentType: "image/png",
          title: input.artifact.title,
        },
      });

      throw error;
    }

    await this.options.writeEvent({
      type: "artifact_upload_completed",
      scope: "tool",
      status: "completed",
      title: "Artifact uploaded",
      summary: `${artifact.title} was uploaded and embedded in the response.`,
      toolName: "publishPngArtifact",
      payload: {
        artifactId: artifact.id,
        fileKey: artifact.fileKey ?? upload.fileKey,
        url: artifact.url ?? upload.url,
        contentType: artifact.contentType ?? upload.contentType,
        byteSize: artifact.byteSize,
        sourceIds: artifact.sourceIds,
      },
    });

    return {
      artifact,
      upload,
      markdown: createPngArtifactMarkdown({
        altText: input.artifact.altText || artifact.title,
        caption: artifact.caption,
        url: upload.url,
      }),
    };
  }
}

export class UploadThingPngArtifactUploadClient implements PngArtifactUploadClient {
  constructor(private readonly token: string | undefined) {}

  async uploadPng(input: PngArtifactUploadInput): Promise<UploadedPngArtifact> {
    if (!this.token) {
      throw new Error("UPLOADTHING_TOKEN is required to upload PNG artifacts.");
    }

    const utapi = new UTApi({ token: this.token });
    const bytes = input.bytes.buffer.slice(
      input.bytes.byteOffset,
      input.bytes.byteOffset + input.bytes.byteLength,
    ) as ArrayBuffer;
    const file = new UTFile([bytes], input.filename, {
      type: "image/png",
      customId: `chat-artifact-${input.run.id}-${crypto.randomUUID()}`,
    });
    const response = await utapi.uploadFiles(file, {
      acl: "public-read",
      contentDisposition: "inline",
    });
    const result = Array.isArray(response) ? response[0] : response;

    if (!result || result.error || !result.data) {
      throw new Error(result?.error?.message ?? "UploadThing PNG upload failed.");
    }

    return {
      fileKey: result.data.key,
      url: result.data.ufsUrl,
      name: result.data.name,
      size: result.data.size,
      contentType: "image/png",
    };
  }

  async deletePng(fileKey: string): Promise<void> {
    if (!this.token) {
      throw new Error("UPLOADTHING_TOKEN is required to delete PNG artifacts.");
    }

    const utapi = new UTApi({ token: this.token });
    const result = await utapi.deleteFiles(fileKey);
    if (!result.success) {
      throw new Error(`UploadThing PNG cleanup failed for file key: ${fileKey}`);
    }
  }
}

export function createPngArtifactMarkdown({
  altText,
  caption,
  url,
}: {
  altText: string;
  caption?: string | null;
  url: string;
}): string {
  const image = `![${escapeMarkdownAlt(altText)}](${url})`;
  const normalizedCaption = normalizeNullableString(caption);

  return normalizedCaption
    ? `${image}\n\n_${escapeMarkdownCaption(normalizedCaption)}_`
    : image;
}

function assertPng(bytes: Uint8Array): void {
  const isPng =
    bytes.length >= pngSignature.length &&
    pngSignature.every((value, index) => bytes[index] === value);

  if (!isPng) {
    throw new Error("Artifact must be a PNG file.");
  }
}

function checksumForBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeNullableString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function escapeMarkdownAlt(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/]/g, "\\]");
}

function escapeMarkdownCaption(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/_/g, "\\_");
}
