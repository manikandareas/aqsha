"use client";

import { useCallback, useEffect, useState } from "react";
import { MAX_CONTEXT_ARTIFACTS } from "@/lib/context-selection";

function readStoredSelection(storageKey: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch (error) {
    if (error instanceof SyntaxError) return new Set();
    throw error;
  }
}

export function useWorkspaceDraftContext(workspaceId: string) {
  const storageKey = `workspace-draft-context:${workspaceId}`;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    readStoredSelection(storageKey),
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      window.sessionStorage.setItem(storageKey, JSON.stringify([...selectedIds]));
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [selectedIds, storageKey]);

  const isSelected = useCallback((artifactId: string) => selectedIds.has(artifactId), [selectedIds]);

  const toggleArtifact = useCallback((artifactId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(artifactId)) {
        next.delete(artifactId);
        return next;
      }
      if (next.size >= MAX_CONTEXT_ARTIFACTS) return current;
      next.add(artifactId);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    isSelected,
    toggleArtifact,
    clear,
  };
}
