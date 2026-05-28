import {
  toStorageId,
  toWorkspaceFolderId,
  toWorkspaceId,
  type StorageId,
  type WorkspaceFolderId,
  type WorkspaceId,
} from "@/lib/convex-refs";

type GenerateUploadUrl = (args: { workspaceId: WorkspaceId }) => Promise<string>;

type CreateUploadedArtifact = (args: {
  workspaceId: WorkspaceId;
  folderId?: WorkspaceFolderId;
  storageId: StorageId;
  fileName: string;
  mimeType: string;
  size: number;
}) => Promise<unknown>;

export async function uploadWorkspaceFiles({
  files,
  workspaceId,
  folderId,
  generateUploadUrl,
  createUploadedArtifact,
}: {
  files: File[];
  workspaceId: string;
  folderId: "root" | string;
  generateUploadUrl: GenerateUploadUrl;
  createUploadedArtifact: CreateUploadedArtifact;
}) {
  const convexWorkspaceId = toWorkspaceId(workspaceId);
  const targetFolderId =
    folderId === "root" ? undefined : toWorkspaceFolderId(folderId);

  await Promise.all(
    files.map(async (file) => {
      const uploadUrl = await generateUploadUrl({ workspaceId: convexWorkspaceId });
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) {
        throw new Error(`Upload gagal untuk ${file.name}.`);
      }

      const body = (await response.json()) as { storageId?: string };
      if (!body.storageId) {
        throw new Error(`Storage ID tidak tersedia untuk ${file.name}.`);
      }

      await createUploadedArtifact({
        workspaceId: convexWorkspaceId,
        folderId: targetFolderId,
        storageId: toStorageId(body.storageId),
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      });
    }),
  );
}
