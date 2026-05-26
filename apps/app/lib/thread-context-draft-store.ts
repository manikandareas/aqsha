"use client";

import { useCallback, useEffect, useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { MAX_CONTEXT_ARTIFACTS } from "@/lib/context-selection";

const emptySelection: string[] = [];

type DraftContextState = {
  selections: Record<string, string[]>;
  dirtyScopes: Record<string, boolean>;
  setInitialSelection: (scopeKey: string, artifactIds: string[]) => void;
  setSelection: (scopeKey: string, artifactIds: string[]) => void;
  toggleArtifact: (scopeKey: string, artifactId: string) => void;
  clearSelection: (scopeKey: string) => void;
  markPersisted: (scopeKey: string, artifactIds: string[]) => void;
};

function normalizeSelection(artifactIds: Iterable<string>) {
  return [...new Set(artifactIds)].filter(Boolean).slice(0, MAX_CONTEXT_ARTIFACTS);
}

export function workspaceContextScopeKey(workspaceId: string) {
  return `workspace:${workspaceId}`;
}

export function threadContextScopeKey(threadId: string) {
  return `thread:${threadId}`;
}

export const useThreadContextDraftStore = create<DraftContextState>()(
  persist(
    (set) => ({
      selections: {},
      dirtyScopes: {},
      setInitialSelection: (scopeKey, artifactIds) =>
        set((state) => {
          if (state.dirtyScopes[scopeKey]) return state;
          return {
            selections: {
              ...state.selections,
              [scopeKey]: normalizeSelection(artifactIds),
            },
          };
        }),
      setSelection: (scopeKey, artifactIds) =>
        set((state) => ({
          selections: {
            ...state.selections,
            [scopeKey]: normalizeSelection(artifactIds),
          },
          dirtyScopes: {
            ...state.dirtyScopes,
            [scopeKey]: true,
          },
        })),
      toggleArtifact: (scopeKey, artifactId) =>
        set((state) => {
          const current = state.selections[scopeKey] ?? emptySelection;
          const exists = current.includes(artifactId);
          const next = exists
            ? current.filter((id) => id !== artifactId)
            : current.length >= MAX_CONTEXT_ARTIFACTS
              ? current
              : [...current, artifactId];
          return {
            selections: {
              ...state.selections,
              [scopeKey]: next,
            },
            dirtyScopes: {
              ...state.dirtyScopes,
              [scopeKey]: true,
            },
          };
        }),
      clearSelection: (scopeKey) =>
        set((state) => ({
          selections: {
            ...state.selections,
            [scopeKey]: [],
          },
          dirtyScopes: {
            ...state.dirtyScopes,
            [scopeKey]: true,
          },
        })),
      markPersisted: (scopeKey, artifactIds) =>
        set((state) => ({
          selections: {
            ...state.selections,
            [scopeKey]: normalizeSelection(artifactIds),
          },
          dirtyScopes: {
            ...state.dirtyScopes,
            [scopeKey]: false,
          },
        })),
    }),
    {
      name: "aqsha-thread-context-draft",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        selections: state.selections,
        dirtyScopes: state.dirtyScopes,
      }),
    },
  ),
);

export function useDraftContextSelection(
  scopeKey: string,
  initialArtifactIds?: string[],
) {
  const selectedIds = useThreadContextDraftStore(
    (state) => state.selections[scopeKey] ?? emptySelection,
  );
  const isDirty = useThreadContextDraftStore(
    (state) => state.dirtyScopes[scopeKey] ?? false,
  );
  const setInitialSelection = useThreadContextDraftStore(
    (state) => state.setInitialSelection,
  );
  const toggle = useThreadContextDraftStore((state) => state.toggleArtifact);
  const clearSelection = useThreadContextDraftStore((state) => state.clearSelection);
  const markPersisted = useThreadContextDraftStore((state) => state.markPersisted);

  useEffect(() => {
    if (!initialArtifactIds) return;
    setInitialSelection(scopeKey, initialArtifactIds);
  }, [initialArtifactIds, scopeKey, setInitialSelection]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const isSelected = useCallback(
    (artifactId: string) => selectedIdSet.has(artifactId),
    [selectedIdSet],
  );
  const toggleArtifact = useCallback(
    (artifactId: string) => toggle(scopeKey, artifactId),
    [scopeKey, toggle],
  );
  const clear = useCallback(() => clearSelection(scopeKey), [clearSelection, scopeKey]);
  const markSelectionPersisted = useCallback(
    (artifactIds: string[]) => markPersisted(scopeKey, artifactIds),
    [markPersisted, scopeKey],
  );

  return {
    selectedIds,
    selectedIdSet,
    selectedCount: selectedIds.length,
    isDirty,
    isSelected,
    toggleArtifact,
    clear,
    markSelectionPersisted,
  };
}
