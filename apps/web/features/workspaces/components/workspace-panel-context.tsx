"use client";

// Provider mode panel kanan workspace detail (nuqs `panel`, history replace).
// Jauh lebih sederhana dari ThreadPanelProvider: tanpa previewMode/lookups.
// `setOpen(true)` (dari SidebarProvider DetailSplitLayout / PanelOpenButton)
// membuka mode terakhir yang diingat dalam mount — default Chat.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useQueryState } from "nuqs";
import {
  CLOSED_WORKSPACE_PANEL,
  isWorkspacePanelOpen,
  parseAsWorkspacePanelMode,
  type WorkspacePanelMode,
} from "../utils/workspace-panel-model";

type WorkspacePanelValue = {
  mode: WorkspacePanelMode;
  isOpen: boolean;
  openChat: () => void;
  openCitations: () => void;
  openCitationDetail: (citationId: string) => void;
  closePanel: () => void;
  /** Dipakai `DetailSplitLayout.onSideOpenChange`; open = mode terakhir (default chat). */
  setOpen: (open: boolean) => void;
};

const WorkspacePanelContext = createContext<WorkspacePanelValue | null>(null);

export function WorkspacePanelProvider({ children }: { children: ReactNode }) {
  const [modeParam, setModeParam] = useQueryState(
    "panel",
    parseAsWorkspacePanelMode.withOptions({ history: "replace" }),
  );
  const mode = modeParam ?? CLOSED_WORKSPACE_PANEL;

  // Mode terbuka terakhir dalam mount — target `setOpen(true)` berikutnya.
  const lastOpenRef = useRef<WorkspacePanelMode>({ kind: "chat" });
  useEffect(() => {
    if (isWorkspacePanelOpen(mode)) lastOpenRef.current = mode;
  }, [mode]);

  const setMode = useCallback(
    (next: WorkspacePanelMode) => {
      void setModeParam(isWorkspacePanelOpen(next) ? next : null);
    },
    [setModeParam],
  );

  const value = useMemo<WorkspacePanelValue>(
    () => ({
      mode,
      isOpen: isWorkspacePanelOpen(mode),
      openChat: () => setMode({ kind: "chat" }),
      openCitations: () => setMode({ kind: "citations" }),
      openCitationDetail: (citationId: string) => setMode({ kind: "citations", citationId }),
      closePanel: () => setMode(CLOSED_WORKSPACE_PANEL),
      setOpen: (open: boolean) =>
        setMode(open ? lastOpenRef.current : CLOSED_WORKSPACE_PANEL),
    }),
    [mode, setMode],
  );

  return (
    <WorkspacePanelContext.Provider value={value}>{children}</WorkspacePanelContext.Provider>
  );
}

export function useWorkspacePanel(): WorkspacePanelValue {
  const value = useContext(WorkspacePanelContext);
  if (!value) {
    throw new Error("useWorkspacePanel harus dipakai di dalam WorkspacePanelProvider.");
  }
  return value;
}
