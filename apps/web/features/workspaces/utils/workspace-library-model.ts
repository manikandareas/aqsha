export type WorkspaceFolder = {
  _id: string;
  name: string;
  status?: "active" | "deleted";
  updatedAt: number;
};

export type WorkspaceArtifact = {
  _id: string;
  folderId?: string;
  artifactType?:
    | "markdown"
    | "plain_text"
    | "pdf"
    | "docx"
    | "html"
    | "svg"
    | "mermaid"
    | "json"
    | "csv"
    | "code"
    | "url";
  artifactFamily?: "text" | "file" | "interactive" | "visual" | "data" | "link";
  source?: "manual" | "upload" | "agent" | "url";
  title: string;
  plainTextPreview?: string;
  status?: "active" | "deleted";
  updatedAt: number;
  createdAt: number;
};

export type ArtifactGroup = {
  id: "root" | string;
  folder: WorkspaceFolder | null;
  artifacts: WorkspaceArtifact[];
};

export type MoveTargetOption = {
  value: "root" | string;
  label: string;
};

export type WorkspaceMoveTargetOption = {
  value: string;
  label: string;
};

export type FolderSummary = WorkspaceFolder & {
  artifactCount: number;
};

export type BreadcrumbSegment = {
  id: "root" | string;
  label: string;
};

export type FolderView = {
  activeFolderId: "root" | string;
  folders: FolderSummary[];
  artifacts: WorkspaceArtifact[];
  breadcrumb: BreadcrumbSegment[];
};

export const ROOT_FOLDER_LABEL = "Semua file";

export function sortFolders(folders: WorkspaceFolder[]) {
  return [...folders].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    return byName || b.updatedAt - a.updatedAt;
  });
}

export function sortArtifacts(artifacts: WorkspaceArtifact[]) {
  return [...artifacts].sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

export function groupArtifactsByFolder({
  folders,
  artifacts,
}: {
  folders: WorkspaceFolder[];
  artifacts: WorkspaceArtifact[];
}): ArtifactGroup[] {
  const activeFolders = sortFolders(folders.filter((folder) => folder.status !== "deleted"));
  const activeFolderIds = new Set(activeFolders.map((folder) => folder._id));
  const rootArtifacts: WorkspaceArtifact[] = [];
  const folderArtifacts = new Map<string, WorkspaceArtifact[]>();

  for (const artifact of artifacts) {
    if (artifact.status === "deleted") continue;
    const folderId = artifact.folderId;
    if (!folderId || !activeFolderIds.has(folderId)) {
      rootArtifacts.push(artifact);
      continue;
    }
    const current = folderArtifacts.get(folderId) ?? [];
    current.push(artifact);
    folderArtifacts.set(folderId, current);
  }

  return [
    {
      id: "root",
      folder: null,
      artifacts: sortArtifacts(rootArtifacts),
    },
    ...activeFolders.map((folder) => ({
      id: folder._id,
      folder,
      artifacts: sortArtifacts(folderArtifacts.get(folder._id) ?? []),
    })),
  ];
}

export function getMoveTargetOptions(folders: WorkspaceFolder[]): MoveTargetOption[] {
  return [
    { value: "root", label: ROOT_FOLDER_LABEL },
    ...sortFolders(folders.filter((folder) => folder.status !== "deleted")).map((folder) => ({
      value: folder._id,
      label: folder.name,
    })),
  ];
}

export function getWorkspaceMoveTargetOptions(
  workspaces: Array<{ _id: string; name: string }>,
  currentWorkspaceId: string,
): WorkspaceMoveTargetOption[] {
  return workspaces
    .filter((workspace) => workspace._id !== currentWorkspaceId)
    .map((workspace) => ({ value: workspace._id, label: workspace.name }));
}

export function getUploadTargetFolderId(activeFolderId: "root" | string) {
  return activeFolderId === "root" ? undefined : activeFolderId;
}

export function resolveActiveFolderId({
  activeFolderId,
  groups,
}: {
  activeFolderId: string;
  groups: ArtifactGroup[];
}): "root" | string {
  if (activeFolderId === "root") return "root";
  const exists = groups.some(
    (group) => group.folder !== null && group.id === activeFolderId,
  );
  return exists ? activeFolderId : "root";
}

export function getFolderView({
  groups,
  activeFolderId,
}: {
  groups: ArtifactGroup[];
  activeFolderId: string;
}): FolderView {
  const resolvedId = resolveActiveFolderId({ activeFolderId, groups });
  const rootGroup = groups.find((group) => group.id === "root");
  const folderGroups = groups.filter((group) => group.folder !== null);

  if (resolvedId === "root") {
    return {
      activeFolderId: "root",
      folders: folderGroups.map((group) => ({
        ...group.folder!,
        artifactCount: group.artifacts.length,
      })),
      artifacts: rootGroup?.artifacts ?? [],
      breadcrumb: [{ id: "root", label: ROOT_FOLDER_LABEL }],
    };
  }

  const activeGroup = folderGroups.find((group) => group.id === resolvedId);

  return {
    activeFolderId: resolvedId,
    folders: [],
    artifacts: activeGroup?.artifacts ?? [],
    breadcrumb: [
      { id: "root", label: ROOT_FOLDER_LABEL },
      { id: resolvedId, label: activeGroup?.folder?.name ?? ROOT_FOLDER_LABEL },
    ],
  };
}

export function expectArtifactsReturnToRootAfterFolderDelete({
  before,
  after,
  deletedFolderId,
}: {
  before: WorkspaceArtifact[];
  after: WorkspaceArtifact[];
  deletedFolderId: string;
}) {
  const movedIds = new Set(
    before
      .filter((artifact) => artifact.folderId === deletedFolderId && artifact.status !== "deleted")
      .map((artifact) => artifact._id),
  );

  return after
    .filter((artifact) => movedIds.has(artifact._id))
    .every((artifact) => artifact.folderId === undefined);
}
