"use client";

import {
  createContext,
  use,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import {
  CLOSED_PANEL,
  isThreadPanelOpen,
  threadPanelReducer,
  type ThreadPanelMode,
} from "../utils/thread-panel-model";

// Right-panel controller for the thread-detail surface (answer-stream redesign
// Fase 4). Mirrors `ComposerMentionsProvider`: a context the in-chat artifact card
// reads to open the artifact side panel without prop-drilling through the
// transcript. Mounted ONLY on the full thread-detail shell, where a real panel
// slot exists — the compact workspace/explore panels have a single (chat) slot,
// so their cards deep-link instead (D2), and `useThreadPanel()` returns null there.

type ThreadPanelValue = {
  mode: ThreadPanelMode;
  isOpen: boolean;
  openArtifactPanel: (artifactId: string) => void;
  openSubagentPanel: (runId: string, subagentId: string) => void;
  openContextPanel: () => void;
  backToContext: () => void;
  closePanel: () => void;
  setOpen: (open: boolean) => void;
};

const ThreadPanelContext = createContext<ThreadPanelValue | null>(null);

export function useThreadPanel(): ThreadPanelValue | null {
  return use(ThreadPanelContext);
}

export function ThreadPanelProvider({ children }: { children: ReactNode }) {
  const [mode, dispatch] = useReducer(threadPanelReducer, CLOSED_PANEL);

  const value = useMemo<ThreadPanelValue>(
    () => ({
      mode,
      isOpen: isThreadPanelOpen(mode),
      openArtifactPanel: (artifactId: string) =>
        dispatch({ type: "openArtifact", artifactId }),
      openSubagentPanel: (runId: string, subagentId: string) =>
        dispatch({ type: "openSubagent", runId, subagentId }),
      openContextPanel: () => dispatch({ type: "openContext" }),
      backToContext: () => dispatch({ type: "back" }),
      closePanel: () => dispatch({ type: "setOpen", open: false }),
      setOpen: (open: boolean) => dispatch({ type: "setOpen", open }),
    }),
    [mode],
  );

  return (
    <ThreadPanelContext.Provider value={value}>
      {children}
    </ThreadPanelContext.Provider>
  );
}
