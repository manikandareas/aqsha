export type WorkspaceFolder = {
  _id: string;
  name: string;
  status?: "active" | "deleted";
  updatedAt: number;
};

export type WorkspaceArtifact = {
  _id: string;
  folderId?: string;
  kind?: "document" | "url";
  type?: string;
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
    { value: "root", label: "Workspace root" },
    ...sortFolders(folders.filter((folder) => folder.status !== "deleted")).map((folder) => ({
      value: folder._id,
      label: folder.name,
    })),
  ];
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

export type SidebarThread = {
  threadId: string;
  workspaceId?: string;
  title: string;
};

export function splitSidebarThreads(threads: SidebarThread[]) {
  return {
    global: threads.filter((thread) => !thread.workspaceId),
    workspaceBound: threads.filter((thread) => Boolean(thread.workspaceId)),
  };
}
