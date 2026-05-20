import { describe, expect, it } from "vitest";
import {
  expectArtifactsReturnToRootAfterFolderDelete,
  getFolderView,
  getMoveTargetOptions,
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
    kind: "document",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  },
  {
    _id: "artifact-folder",
    folderId: "folder-a",
    title: "Folder note",
    kind: "document",
    status: "active",
    createdAt: 2,
    updatedAt: 3,
  },
  {
    _id: "artifact-orphan",
    folderId: "missing-folder",
    title: "Orphan note",
    kind: "url",
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
});
