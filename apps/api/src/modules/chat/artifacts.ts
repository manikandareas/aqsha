import { UTApi, UTFile } from "uploadthing/server";
import type { AgentRun, AppendAgentEventInput, ChatScope } from "./store";

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export type ChatArtifactKind = "visual_png";

export interface PngArtifactInput {
  bytes: Uint8Array;
  filename: string;
  title: string;
  altText?: string | null;
  caption?: string | null;
  sourceIds?: string[];
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
  chatThreadId: string;
  runId: string;
  kind: ChatArtifactKind;
  title: string;
  caption: string | null;
  fileKey: string;
  url: string;
  contentType: "image/png";
  byteSize: number | null;
  sourceIds: string[];
  metadata: unknown;
}

export interface PersistedChatArtifact extends PersistChatArtifactInput {
  id: string;
  createdAt: string;
}

export interface PngArtifactUploadClient {
  uploadPng(input: PngArtifactUploadInput): Promise<UploadedPngArtifact>;
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

    let upload: UploadedPngArtifact;
    let artifact: PersistedChatArtifact;

    try {
      upload = await this.options.uploadClient.uploadPng({
        ...input.artifact,
        scope: input.scope,
        run: input.run,
      });

      artifact = await this.options.persistArtifact({
        chatThreadId: input.run.chatThreadId,
        runId: input.run.id,
        kind: "visual_png",
        title: input.artifact.title,
        caption: normalizeNullableString(input.artifact.caption),
        fileKey: upload.fileKey,
        url: upload.url,
        contentType: "image/png",
        byteSize: upload.size,
        sourceIds: input.artifact.sourceIds ?? [],
        metadata: metadataForArtifact(input.artifact.metadata, upload),
      });
    } catch (error) {
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
        fileKey: artifact.fileKey,
        url: artifact.url,
        contentType: artifact.contentType,
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
        url: artifact.url,
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
      url: result.data.url,
      name: result.data.name,
      size: result.data.size,
      contentType: "image/png",
    };
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

function metadataForArtifact(metadata: unknown, upload: UploadedPngArtifact): unknown {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return {
      ...metadata,
      upload: {
        provider: "uploadthing",
        fileName: upload.name,
      },
    };
  }

  return {
    value: metadata ?? null,
    upload: {
      provider: "uploadthing",
      fileName: upload.name,
    },
  };
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
