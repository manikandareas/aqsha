"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type DraftContextArtifact = { artifactId: string; title: string };

type ComposerMentionsContextValue = {
  contextArtifacts: DraftContextArtifact[];
  addContextArtifact: (artifact: DraftContextArtifact) => void;
  removeContextArtifact: (artifactId: string) => void;
};

const ComposerMentionsContext = createContext<ComposerMentionsContextValue | null>(null);

export function ComposerMentionsProvider({
  children,
}: {
  children: ReactNode;
  threadId?: string;
  ambientWorkspaceId?: string | null;
}) {
  const [contextArtifacts, setContextArtifacts] = useState<DraftContextArtifact[]>([]);
  const value = useMemo(
    () => ({
      contextArtifacts,
      addContextArtifact: (artifact: DraftContextArtifact) =>
        setContextArtifacts((current) =>
          current.some((item) => item.artifactId === artifact.artifactId)
            ? current
            : [...current, artifact],
        ),
      removeContextArtifact: (artifactId: string) =>
        setContextArtifacts((current) =>
          current.filter((item) => item.artifactId !== artifactId),
        ),
    }),
    [contextArtifacts],
  );
  return (
    <ComposerMentionsContext.Provider value={value}>{children}</ComposerMentionsContext.Provider>
  );
}

export function useComposerMentions() {
  const context = useContext(ComposerMentionsContext);
  if (!context) {
    throw new Error("useComposerMentions must be used within ComposerMentionsProvider");
  }
  return context;
}

export function usePanelContextSelection(args: {
  workspaceId: string;
  workspaceName: string;
  titleById: Map<string, string>;
}) {
  const { contextArtifacts, addContextArtifact, removeContextArtifact } = useComposerMentions();
  const selectedIds = new Set(contextArtifacts.map((item) => item.artifactId));

  return {
    contextArtifacts,
    toggleArtifact: (artifact: DraftContextArtifact) => {
      const exists = contextArtifacts.some((item) => item.artifactId === artifact.artifactId);
      if (exists) removeContextArtifact(artifact.artifactId);
      else addContextArtifact(artifact);
    },
    removeContextArtifact,
    getArtifactSelected: (artifactId: string) => selectedIds.has(artifactId),
    onToggleArtifactContext: (artifactId: string) => {
      const existing = contextArtifacts.find((item) => item.artifactId === artifactId);
      if (existing) {
        removeContextArtifact(artifactId);
        return;
      }
      addContextArtifact({
        artifactId,
        title: args.titleById.get(artifactId) ?? "Paper",
      });
    },
    onSetArtifactContextSelection: (artifactIds: string[]) => {
      const keep = new Set(artifactIds);
      for (const item of contextArtifacts) {
        if (!keep.has(item.artifactId)) removeContextArtifact(item.artifactId);
      }
      for (const artifactId of artifactIds) {
        if (!selectedIds.has(artifactId)) {
          addContextArtifact({
            artifactId,
            title: args.titleById.get(artifactId) ?? "Paper",
          });
        }
      }
    },
  };
}
