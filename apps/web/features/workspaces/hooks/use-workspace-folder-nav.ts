"use client";

import { parseAsString, useQueryState } from "nuqs";import { resolveActiveFolderId, type ArtifactGroup } from "../utils/workspace-library-model";

export function useWorkspaceFolderNav(groups: ArtifactGroup[]) {
  const [folderParam, setFolderParam] = useQueryState(
    "folder",
    parseAsString.withDefault("root").withOptions({
      history: "replace",
      shallow: true,
    }),
  );

  const activeFolderId = resolveActiveFolderId({ activeFolderId: folderParam, groups });

  const openFolder = (folderId: string) => {
    void setFolderParam(folderId);
  };

  const navigateTo = (folderId: "root" | string) => {
    void setFolderParam(folderId);
  };

  return {
    activeFolderId,
    openFolder,
    navigateTo,
  };
}
