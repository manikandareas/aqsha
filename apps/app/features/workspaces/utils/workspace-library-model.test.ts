import { describe, expect, it } from "vitest";
import {
  expectArtifactsReturnToRootAfterFolderDelete,
  getMoveTargetOptions,
  groupArtifactsByFolder,
  splitSidebarThreads,
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

  it("includes workspace root in move targets", () => {
    expect(getMoveTargetOptions(folders)).toEqual([
      { value: "root", label: "Workspace root" },
      { value: "folder-a", label: "Drafts" },
      { value: "folder-b", label: "Reading" },
    ]);
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
    const threads = splitSidebarThreads([
      { threadId: "global", title: "Global" },
      { threadId: "workspace", workspaceId: "workspace-1", title: "Workspace" },
    ]);

    expect(threads.global.map((thread) => thread.threadId)).toEqual(["global"]);
    expect(threads.workspaceBound.map((thread) => thread.threadId)).toEqual([
      "workspace",
    ]);
  });
});
