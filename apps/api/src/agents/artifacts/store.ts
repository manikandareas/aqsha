import { Buffer } from "node:buffer";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, sep } from "node:path";

export const ASTRA_ARTIFACT_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".json", ".md"]);

export type PersistArtifactInput = {
  sourcePath?: string;
  content?: Uint8Array;
  relativePath: string;
  mimeType?: string;
};

export type PersistedArtifact = {
  name: string;
  relativePath: string;
  mimeType?: string;
  sizeBytes: number;
  url?: string;
};

export type PersistArtifactRunOptions = {
  artifactRoot: string;
  workspace: string;
  conversationId?: string;
  runId?: string;
  artifacts: PersistArtifactInput[];
  maxArtifactBytes: number;
  maxArtifactCount: number;
};

export async function persistArtifactRun({
  artifactRoot,
  workspace,
  conversationId = "conversationless",
  runId = crypto.randomUUID().replaceAll("-", ""),
  artifacts,
  maxArtifactBytes,
  maxArtifactCount,
}: PersistArtifactRunOptions): Promise<{ runId: string; directory: string; artifacts: PersistedArtifact[] }> {
  if (artifacts.length > maxArtifactCount) {
    throw new Error(`Sandbox produced too many artifacts. Max allowed: ${maxArtifactCount}.`);
  }

  const directory = join(artifactRoot, safeSegment(workspace), safeSegment(conversationId), safeSegment(runId));
  const persisted: PersistedArtifact[] = [];

  await mkdir(join(directory, "artifacts"), { recursive: true });

  for (const artifact of artifacts) {
    const safeRelativePath = validateArtifactRelativePath(artifact.relativePath);
    const content = await artifactContent(artifact);

    if (content.byteLength > maxArtifactBytes) {
      throw new Error(`Artifact exceeds size limit of ${maxArtifactBytes} bytes: ${safeRelativePath}`);
    }

    const destination = join(directory, safeRelativePath);
    const destinationRel = relative(directory, destination);
    if (destinationRel.startsWith("..") || destinationRel.startsWith(sep) || isAbsolute(destinationRel)) {
      throw new Error("Artifact destination escapes artifact directory.");
    }

    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);

    persisted.push({
      name: basename(safeRelativePath),
      relativePath: safeRelativePath,
      mimeType: artifact.mimeType,
      sizeBytes: content.byteLength,
      url: `/api/agents/artifacts/${encodeURIComponent(safeSegment(workspace))}/${encodeURIComponent(safeSegment(conversationId))}/${encodeURIComponent(safeSegment(runId))}/${safeRelativePath.split("/").map(encodeURIComponent).join("/")}`,
    });
  }

  await writeFile(
    join(directory, "artifact_manifest.json"),
    JSON.stringify({ runId, artifacts: persisted.map((artifact) => ({ ...artifact, status: "passed" })) }, null, 2),
    "utf8",
  );

  return { runId, directory, artifacts: persisted };
}

export function validateArtifactRelativePath(path: string): string {
  if (!path.trim()) {
    throw new Error("Artifact path is required.");
  }

  if (path.includes("\0")) {
    throw new Error("Artifact path contains a null byte.");
  }

  if (isAbsolute(path)) {
    throw new Error("Artifact path must be relative.");
  }

  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);

  if (parts.length === 0 || parts.includes("..")) {
    throw new Error("Artifact path traversal is not allowed.");
  }

  if (parts.some((part) => part.startsWith("."))) {
    throw new Error("Hidden artifact files are not allowed.");
  }

  if (parts[0] !== "artifacts" && normalized !== "visual_artifacts.md" && normalized !== "artifact_manifest.json") {
    throw new Error("Artifacts must be written under artifacts/ or be an approved manifest file.");
  }

  const extension = extname(normalized).toLowerCase();
  if (!ASTRA_ARTIFACT_EXTENSIONS.has(extension)) {
    throw new Error(`Artifact extension is not allowed: ${extension || "none"}`);
  }

  return parts.join("/");
}

async function artifactContent(artifact: PersistArtifactInput): Promise<Buffer | Uint8Array> {
  if (artifact.content) {
    return artifact.content;
  }

  if (!artifact.sourcePath) {
    throw new Error("Artifact input requires sourcePath or content.");
  }

  const sourceInfo = await stat(artifact.sourcePath);
  if (!sourceInfo.isFile()) {
    throw new Error("Artifact source must be a file.");
  }

  return readFile(artifact.sourcePath);
}

function safeSegment(value: string): string {
  const segment = value.trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^\.+/, "");
  if (!segment) {
    throw new Error("Artifact path segment is empty after normalization.");
  }
  return segment.slice(0, 120);
}
