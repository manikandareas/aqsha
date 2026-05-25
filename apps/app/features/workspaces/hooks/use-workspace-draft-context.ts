"use client";

import {
  useDraftContextSelection,
  workspaceContextScopeKey,
} from "@/lib/thread-context-draft-store";

export function useWorkspaceDraftContext(workspaceId: string) {
  return useDraftContextSelection(workspaceContextScopeKey(workspaceId));
}
