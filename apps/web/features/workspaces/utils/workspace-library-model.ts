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

export const workspaceArtifactTypes = [
  "markdown",
  "plain_text",
  "pdf",
  "docx",
  "html",
  "svg",
  "mermaid",
  "json",
  "csv",
  "code",
  "url",
] as const;

export type WorkspaceArtifactType = (typeof workspaceArtifactTypes)[number];

export type WorkspaceArtifactSort =
  | "updated-desc"
  | "updated-asc"
  | "created-desc"
  | "created-asc"
  | "title-asc"
  | "title-desc";

export const defaultWorkspaceArtifactSort = "updated-desc" satisfies WorkspaceArtifactSort;

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

function sortFolders(folders: WorkspaceFolder[]) {
  return Array.from(folders).sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    return byName || b.updatedAt - a.updatedAt;
  });
}

function sortWorkspaceArtifacts(
  artifacts: WorkspaceArtifact[],
  sort: WorkspaceArtifactSort,
) {
  return Array.from(artifacts).sort((a, b) => {
    switch (sort) {
      case "updated-asc":
        return a.updatedAt - b.updatedAt || compareArtifactTitles(a, b);
      case "created-desc":
        return b.createdAt - a.createdAt || compareArtifactTitles(a, b);
      case "created-asc":
        return a.createdAt - b.createdAt || compareArtifactTitles(a, b);
      case "title-asc":
        return compareArtifactTitles(a, b) || b.updatedAt - a.updatedAt;
      case "title-desc":
        return compareArtifactTitles(b, a) || b.updatedAt - a.updatedAt;
      case "updated-desc":
        return b.updatedAt - a.updatedAt || compareArtifactTitles(a, b);
    }
  });
}

function compareArtifactTitles(a: WorkspaceArtifact, b: WorkspaceArtifact) {
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

export function applyWorkspaceArtifactControls({
  artifacts,
  query,
  types,
  sort,
}: {
  artifacts: WorkspaceArtifact[];
  query: string;
  types: WorkspaceArtifactType[];
  sort: WorkspaceArtifactSort;
}) {
  const typeSet = new Set(types);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered =
    typeSet.size === 0 && normalizedQuery.length === 0
      ? artifacts
      : artifacts.filter(
          (artifact): artifact is WorkspaceArtifact & { artifactType: WorkspaceArtifactType } => {
            const matchesType =
              typeSet.size === 0 ||
              (artifact.artifactType !== undefined && typeSet.has(artifact.artifactType));
            const matchesQuery =
              normalizedQuery.length === 0 ||
              [artifact.title, artifact.plainTextPreview, artifact.artifactType]
                .filter(Boolean)
                .some((value) => value!.toLocaleLowerCase().includes(normalizedQuery));

            return matchesType && matchesQuery;
          },
        );

  return sortWorkspaceArtifacts(filtered, sort);
}

export function groupArtifactsByFolder({
  folders,
  artifacts,
  sort = defaultWorkspaceArtifactSort,
}: {
  folders: WorkspaceFolder[];
  artifacts: WorkspaceArtifact[];
  sort?: WorkspaceArtifactSort;
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
      artifacts: sortWorkspaceArtifacts(rootArtifacts, sort),
    },
    ...activeFolders.map((folder) => ({
      id: folder._id,
      folder,
      artifacts: sortWorkspaceArtifacts(folderArtifacts.get(folder._id) ?? [], sort),
    })),
  ];
}

export function getMoveTargetOptions(folders: WorkspaceFolder[]): MoveTargetOption[] {
  const activeFolders = folders.flatMap((folder) =>
    folder.status === "deleted" ? [] : [folder],
  );

  return [
    { value: "root", label: ROOT_FOLDER_LABEL },
    ...sortFolders(activeFolders).map((folder) => ({
      value: folder._id,
      label: folder.name,
    })),
  ];
}

export function getWorkspaceMoveTargetOptions(
  workspaces: Array<{ _id: string; name: string }>,
  currentWorkspaceId: string,
): WorkspaceMoveTargetOption[] {
  return workspaces.flatMap((workspace) =>
    workspace._id === currentWorkspaceId
      ? []
      : [{ value: workspace._id, label: workspace.name }],
  );
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
    before.flatMap((artifact) =>
      artifact.folderId === deletedFolderId && artifact.status !== "deleted"
        ? [artifact._id]
        : [],
    ),
  );

  return after
    .filter((artifact) => movedIds.has(artifact._id))
    .every((artifact) => artifact.folderId === undefined);
}
