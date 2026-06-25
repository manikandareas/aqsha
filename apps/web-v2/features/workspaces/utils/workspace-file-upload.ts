import {
  toStorageId,
  toWorkspaceFolderId,
  toWorkspaceId,
  type StorageId,
  type WorkspaceFolderId,
  type WorkspaceId,
} from "@/lib/convex-refs";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import {
  isAllowedWorkspaceUploadFile,
  UPLOAD_REJECTED_MESSAGE,
  WORKSPACE_UPLOAD_ACCEPT,
} from "@/lib/artifact-upload-policy";

export {
  isAllowedWorkspaceUploadFile,
  UPLOAD_REJECTED_MESSAGE,
  WORKSPACE_UPLOAD_ACCEPT,
};

export const MAX_WORKSPACE_UPLOAD_FILES = 20;
export const WORKSPACE_UPLOAD_CONCURRENCY = 3;

export type WorkspaceUploadStatus =
  | "queued"
  | "uploading"
  | "processing"
  | "complete"
  | "failed";

type GenerateUploadUrl = (args: { workspaceId: WorkspaceId }) => Promise<string>;

type CreateUploadedArtifact = (args: {
  workspaceId: WorkspaceId;
  folderId?: WorkspaceFolderId;
  storageId: StorageId;
  fileName: string;
  mimeType: string;
  size: number;
}) => Promise<unknown>;

export type WorkspaceUploadProgressEvent = {
  file: File;
  index: number;
  status: WorkspaceUploadStatus;
  progress: number;
  error?: string;
};

export type WorkspaceUploadResult =
  | { ok: true; file: File; index: number }
  | { ok: false; file: File; index: number; error: string };

type UploadToStorage = (args: {
  file: File;
  uploadUrl: string;
  onProgress?: (progress: number) => void;
}) => Promise<StorageId>;

export function validateWorkspaceUploadBatch(files: File[]) {
  if (files.length > MAX_WORKSPACE_UPLOAD_FILES) {
    throw new Error(`Maksimal ${MAX_WORKSPACE_UPLOAD_FILES} file dalam satu upload.`);
  }
}

export function getFailedWorkspaceUploadFiles(results: WorkspaceUploadResult[]) {
  return results
    .filter((result): result is Extract<WorkspaceUploadResult, { ok: false }> => !result.ok)
    .map((result) => result.file);
}

export async function runLimitedConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  if (items.length === 0) return;

  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  const runNext = async (): Promise<void> => {
    const index = nextIndex;
    if (index >= items.length) return;
    nextIndex += 1;
    await worker(items[index] as T, index);
    return runNext();
  };

  await Promise.all(
    Array.from({ length: workerCount }, () => runNext()),
  );
}

async function uploadWorkspaceFile({
  file,
  workspaceId,
  folderId,
  generateUploadUrl,
  createUploadedArtifact,
  onProgress,
  onStorageComplete,
  uploadToStorage = uploadFileToStorage,
}: {
  file: File;
  workspaceId: string;
  folderId: "root" | string;
  generateUploadUrl: GenerateUploadUrl;
  createUploadedArtifact: CreateUploadedArtifact;
  onProgress?: (progress: number) => void;
  onStorageComplete?: () => void;
  uploadToStorage?: UploadToStorage;
}) {
  const convexWorkspaceId = toWorkspaceId(workspaceId);
  const targetFolderId =
    folderId === "root" ? undefined : toWorkspaceFolderId(folderId);

  const uploadUrl = await generateUploadUrl({ workspaceId: convexWorkspaceId });
  const storageId = await uploadToStorage({
    file,
    uploadUrl,
    onProgress,
  });
  onStorageComplete?.();

  await createUploadedArtifact({
    workspaceId: convexWorkspaceId,
    folderId: targetFolderId,
    storageId,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  });
}

export async function uploadWorkspaceFiles({
  files,
  workspaceId,
  folderId,
  generateUploadUrl,
  createUploadedArtifact,
  onFileChange,
  uploadToStorage,
}: {
  files: File[];
  workspaceId: string;
  folderId: "root" | string;
  generateUploadUrl: GenerateUploadUrl;
  createUploadedArtifact: CreateUploadedArtifact;
  onFileChange?: (event: WorkspaceUploadProgressEvent) => void;
  uploadToStorage?: UploadToStorage;
}) {
  validateWorkspaceUploadBatch(files);

  const results: WorkspaceUploadResult[] = files.map((file, index) => ({
    ok: false,
    file,
    index,
    error: "Upload belum dimulai.",
  }));

  await runLimitedConcurrency(
    files,
    WORKSPACE_UPLOAD_CONCURRENCY,
    async (file, index) => {
      if (!isAllowedWorkspaceUploadFile(file)) {
        onFileChange?.({
          file,
          index,
          status: "failed",
          progress: 0,
          error: UPLOAD_REJECTED_MESSAGE,
        });
        results[index] = { ok: false, file, index, error: UPLOAD_REJECTED_MESSAGE };
        return;
      }
      try {
        onFileChange?.({ file, index, status: "uploading", progress: 0 });
        await uploadWorkspaceFile({
          file,
          workspaceId,
          folderId,
          generateUploadUrl,
          createUploadedArtifact,
          uploadToStorage,
          onProgress: (progress) => {
            onFileChange?.({ file, index, status: "uploading", progress });
          },
          onStorageComplete: () => {
            onFileChange?.({ file, index, status: "processing", progress: 100 });
          },
        });
        onFileChange?.({ file, index, status: "complete", progress: 100 });
        results[index] = { ok: true, file, index };
      } catch (error) {
        const message = readableConvexErrorMessage(error, "Upload gagal.");
        onFileChange?.({
          file,
          index,
          status: "failed",
          progress: 0,
          error: message,
        });
        results[index] = { ok: false, file, index, error: message };
      }
    },
  );

  return results;
}

function uploadFileToStorage({
  file,
  uploadUrl,
  onProgress,
}: {
  file: File;
  uploadUrl: string;
  onProgress?: (progress: number) => void;
}): Promise<StorageId> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", uploadUrl);
    request.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    };

    request.onerror = () => reject(new Error(`Upload gagal untuk ${file.name}.`));
    request.onabort = () => reject(new Error(`Upload dibatalkan untuk ${file.name}.`));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`Upload gagal untuk ${file.name}.`));
        return;
      }

      try {
        const body = JSON.parse(request.responseText) as { storageId?: string };
        if (!body.storageId) {
          reject(new Error(`Storage ID tidak tersedia untuk ${file.name}.`));
          return;
        }
        resolve(toStorageId(body.storageId));
      } catch {
        reject(new Error(`Respons upload tidak valid untuk ${file.name}.`));
      }
    };

    request.send(file);
  });
}
