import { describe, expect, it } from "vitest";
import {
  applyWorkspaceArtifactControls,
  expectArtifactsReturnToRootAfterFolderDelete,
  getFolderView,
  getMoveTargetOptions,
  getUploadTargetFolderId,
  getWorkspaceMoveTargetOptions,
  groupArtifactsByFolder,
  resolveActiveFolderId,
  ROOT_FOLDER_LABEL,
  type WorkspaceArtifact,
  type WorkspaceFolder,
} from "./workspace-library-model";

const folders: WorkspaceFolder[] = [
  { _id: "folder-b", name: "Reading", status: "active", updatedAt: 20 },
  { _id: "folder-a", name: "Drafts", status: "active", updatedAt: 10 },
];

const artifacts: WorkspaceArtifact[] = [
  {
    _id: "artifact-root",
    title: "Root note",
    artifactType: "markdown",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  },
  {
    _id: "artifact-folder",
    folderId: "folder-a",
    title: "Folder note",
    artifactType: "markdown",
    status: "active",
    createdAt: 2,
    updatedAt: 3,
  },
  {
    _id: "artifact-orphan",
    folderId: "missing-folder",
    title: "Orphan note",
    artifactType: "url",
    status: "active",
    createdAt: 3,
    updatedAt: 4,
  },
];

describe("workspace library model", () => {
  it("groups active artifacts into root and one-level folders", () => {
    const groups = groupArtifactsByFolder({ folders, artifacts });

    expect(groups.map((group) => group.id)).toEqual(["root", "folder-a", "folder-b"]);
    expect(groups[0]?.artifacts.map((artifact) => artifact._id)).toEqual([
      "artifact-orphan",
      "artifact-root",
    ]);
    expect(groups[1]?.artifacts.map((artifact) => artifact._id)).toEqual([
      "artifact-folder",
    ]);
  });

  it("includes semua file in move targets", () => {
    expect(getMoveTargetOptions(folders)).toEqual([
      { value: "root", label: ROOT_FOLDER_LABEL },
      { value: "folder-a", label: "Drafts" },
      { value: "folder-b", label: "Reading" },
    ]);
  });

  it("excludes the active workspace from workspace move targets", () => {
    expect(
      getWorkspaceMoveTargetOptions(
        [
          { _id: "workspace-a", name: "Current" },
          { _id: "workspace-b", name: "Target" },
        ],
        "workspace-a",
      ),
    ).toEqual([{ value: "workspace-b", label: "Target" }]);
  });

  it("resolves upload target folder for root and folder views", () => {
    expect(getUploadTargetFolderId("root")).toBeUndefined();
    expect(getUploadTargetFolderId("folder-a")).toBe("folder-a");
  });

  it("builds root folder view with folders and root artifacts", () => {
    const groups = groupArtifactsByFolder({ folders, artifacts });
    const view = getFolderView({ groups, activeFolderId: "root" });

    expect(view.activeFolderId).toBe("root");
    expect(view.folders.map((folder) => folder._id)).toEqual(["folder-a", "folder-b"]);
    expect(view.folders[0]?.artifactCount).toBe(1);
    expect(view.artifacts.map((artifact) => artifact._id)).toEqual([
      "artifact-orphan",
      "artifact-root",
    ]);
    expect(view.breadcrumb).toEqual([{ id: "root", label: ROOT_FOLDER_LABEL }]);
  });

  it("keeps the selected artifact sort inside folder groups", () => {
    const groups = groupArtifactsByFolder({
      folders,
      artifacts,
      sort: "title-asc",
    });
    const view = getFolderView({ groups, activeFolderId: "root" });

    expect(view.artifacts.map((artifact) => artifact._id)).toEqual([
      "artifact-orphan",
      "artifact-root",
    ]);
  });

  it("builds active folder view with breadcrumb", () => {
    const groups = groupArtifactsByFolder({ folders, artifacts });
    const view = getFolderView({ groups, activeFolderId: "folder-a" });

    expect(view.activeFolderId).toBe("folder-a");
    expect(view.folders).toEqual([]);
    expect(view.artifacts.map((artifact) => artifact._id)).toEqual(["artifact-folder"]);
    expect(view.breadcrumb).toEqual([
      { id: "root", label: ROOT_FOLDER_LABEL },
      { id: "folder-a", label: "Drafts" },
    ]);
  });

  it("falls back to root for unknown folder ids", () => {
    const groups = groupArtifactsByFolder({ folders, artifacts });
    expect(resolveActiveFolderId({ activeFolderId: "missing", groups })).toBe("root");
    expect(getFolderView({ groups, activeFolderId: "missing" }).activeFolderId).toBe("root");
  });

  it("models folder deletion as child artifacts returning to root after refetch", () => {
    expect(
      expectArtifactsReturnToRootAfterFolderDelete({
        before: artifacts,
        after: artifacts.map((artifact) =>
          artifact.folderId === "folder-a"
            ? { ...artifact, folderId: undefined }
            : artifact,
        ),
        deletedFolderId: "folder-a",
      }),
    ).toBe(true);
  });

  it("separates global and workspace-bound sidebar threads", () => {
    const items = [
      { threadId: "global", title: "Global" },
      { threadId: "workspace", workspaceId: "workspace-1", title: "Workspace" },
    ];
    const global = items.filter((thread) => !thread.workspaceId);
    const workspaceBound = items.filter((thread) => Boolean(thread.workspaceId));

    expect(global.map((thread) => thread.threadId)).toEqual(["global"]);
    expect(workspaceBound.map((thread) => thread.threadId)).toEqual(["workspace"]);
  });

  it("filters artifacts by document type", () => {
    const result = applyWorkspaceArtifactControls({
      artifacts,
      query: "",
      types: ["url"],
      sort: "updated-desc",
    });

    expect(result.map((artifact) => artifact._id)).toEqual(["artifact-orphan"]);
  });

  it("sorts artifacts by title and dates", () => {
    const titleSorted = applyWorkspaceArtifactControls({
      artifacts,
      query: "",
      types: [],
      sort: "title-asc",
    });
    const createdSorted = applyWorkspaceArtifactControls({
      artifacts,
      query: "",
      types: [],
      sort: "created-asc",
    });

    expect(titleSorted.map((artifact) => artifact._id)).toEqual([
      "artifact-folder",
      "artifact-orphan",
      "artifact-root",
    ]);
    expect(createdSorted.map((artifact) => artifact._id)).toEqual([
      "artifact-root",
      "artifact-folder",
      "artifact-orphan",
    ]);
  });

  it("searches artifacts by title and preview text", () => {
    const result = applyWorkspaceArtifactControls({
      artifacts: [
        ...artifacts,
        {
          _id: "artifact-preview",
          title: "Untitled",
          plainTextPreview: "Cognitive load and multimedia notes",
          artifactType: "plain_text",
          status: "active",
          createdAt: 4,
          updatedAt: 5,
        },
      ],
      query: "cognitive",
      types: [],
      sort: "updated-desc",
    });

    expect(result.map((artifact) => artifact._id)).toEqual(["artifact-preview"]);
  });
});
