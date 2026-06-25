"use client";

import { useState } from "react";
import type { WorkspaceArtifact, WorkspaceFolder } from "../utils/workspace-library-model";

export function useWorkspaceLibraryDialogState() {
  const [archiveWorkspaceOpen, setArchiveWorkspaceOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [createDocumentOpen, setCreateDocumentOpen] = useState(false);
  const [createUrlOpen, setCreateUrlOpen] = useState(false);
  const [renameFolder, setRenameFolder] = useState<WorkspaceFolder | null>(null);
  const [deleteFolder, setDeleteFolder] = useState<WorkspaceFolder | null>(null);
  const [renameArtifact, setRenameArtifact] = useState<WorkspaceArtifact | null>(null);
  const [deleteArtifact, setDeleteArtifact] = useState<WorkspaceArtifact | null>(null);

  return {
    archiveWorkspaceOpen,
    setArchiveWorkspaceOpen,
    createFolderOpen,
    setCreateFolderOpen,
    createDocumentOpen,
    setCreateDocumentOpen,
    createUrlOpen,
    setCreateUrlOpen,
    renameFolder,
    setRenameFolder,
    deleteFolder,
    setDeleteFolder,
    renameArtifact,
    setRenameArtifact,
    deleteArtifact,
    setDeleteArtifact,
    libraryHandlers: {
      onRenameFolder: setRenameFolder,
      onDeleteFolder: setDeleteFolder,
      onRenameArtifact: setRenameArtifact,
      onDeleteArtifact: setDeleteArtifact,
      onCreateFolder: () => setCreateFolderOpen(true),
      onCreateDocument: () => setCreateDocumentOpen(true),
      onCreateUrl: () => setCreateUrlOpen(true),
      onArchiveWorkspace: () => setArchiveWorkspaceOpen(true),
    },
  };
}
