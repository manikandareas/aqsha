"use client";

import { useQueryState } from "nuqs";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ThreadPanelLookups } from "@/features/threads/lib/thread-panel-data";
import {
  CLOSED_PANEL,
  isThreadPanelOpen,
  parseAsThreadPanelMode,
  type ThreadPanelMode,
} from "../utils/thread-panel-model";

// Right-panel controller for the thread-detail surface. In-chat cards read this to
// open a detail panel (artifact / source / search / plan) without prop-drilling.
// Mounted ONLY on the full thread-detail shell, where a real panel slot exists —
// the compact workspace/explore panels have a single (chat) slot, so `useThreadPanel()`
// returns null there and the cards keep their default behaviour.
//
// Panel mode lives in the URL (nuqs `panel` param) so detail panels are deep-linkable
// and survive refresh. The data the panels render is resolved from `lookups`, which the
// chat surface registers via `useRegisterThreadPanelData` (it owns the parsed timeline).

type ThreadPanelValue = {
  mode: ThreadPanelMode;
  isOpen: boolean;
  openArtifactPanel: (artifactId: string) => void;
  openSourcesPanel: (messageId: string) => void;
  /** Open a `/deep` sub-question search step, scoped to its run (`turnId`). */
  openSearchPanel: (turnId: string, subQuestionIndex: number) => void;
  openStepPanel: (toolCallId: string) => void;
  /** Open a run's research plan (`turnId`, or `LIVE_PLAN_KEY` for the live gate). */
  openPlanPanel: (turnId: string) => void;
  openContextPanel: () => void;
  closePanel: () => void;
  setOpen: (open: boolean) => void;
};

type ThreadPanelDataValue = {
  /** Id-keyed detail lookups registered by the chat surface (null until registered). */
  lookups: ThreadPanelLookups | null;
  registerLookups: (lookups: ThreadPanelLookups | null) => void;
};

// Mode + openers (stable across a streaming turn) and the streaming `lookups` live in SEPARATE
// contexts: the surface re-registers `lookups` on every token, so bundling them would churn the
// whole value identity and re-render every in-message card via `useThreadPanel()`. Splitting keeps
// the openers' value stable (cards don't re-render mid-stream); only the open detail panel (which
// reads `useThreadPanelData()`) re-renders as lookups update.
const ThreadPanelContext = createContext<ThreadPanelValue | null>(null);
const ThreadPanelDataContext = createContext<ThreadPanelDataValue>({
  lookups: null,
  registerLookups: () => {},
});

export function useThreadPanel(): ThreadPanelValue | null {
  return use(ThreadPanelContext);
}

/** Detail lookups for the open panel — null outside the full thread shell. */
export function useThreadPanelData(): ThreadPanelLookups | null {
  return use(ThreadPanelDataContext).lookups;
}

/**
 * Publish the surface's id-keyed detail lookups to the panel controller. No-op when
 * the provider is absent (compact panels). Cleared on unmount so a stale thread's
 * lookups never leak into the next one.
 */
export function useRegisterThreadPanelData(lookups: ThreadPanelLookups | null) {
  const register = use(ThreadPanelDataContext).registerLookups;
  useEffect(() => {
    register(lookups);
    return () => register(null);
  }, [register, lookups]);
}

export function ThreadPanelProvider({ children }: { children: ReactNode }) {
  const [modeParam, setModeParam] = useQueryState(
    "panel",
    parseAsThreadPanelMode.withOptions({ history: "replace" }),
  );
  const mode = modeParam ?? CLOSED_PANEL;
  const [lookups, setLookups] = useState<ThreadPanelLookups | null>(null);

  // Openers depend only on the (stable) nuqs setter, so in-message cards that read
  // them don't re-render when the mode or lookups change mid-stream.
  const openArtifactPanel = useCallback(
    (artifactId: string) => void setModeParam({ kind: "artifact", artifactId }),
    [setModeParam],
  );
  const openSourcesPanel = useCallback(
    (messageId: string) => void setModeParam({ kind: "sources", messageId }),
    [setModeParam],
  );
  const openSearchPanel = useCallback(
    (turnId: string, subQuestionIndex: number) =>
      void setModeParam({ kind: "search", turnId, subQuestionIndex }),
    [setModeParam],
  );
  const openStepPanel = useCallback(
    (toolCallId: string) => void setModeParam({ kind: "step", toolCallId }),
    [setModeParam],
  );
  const openPlanPanel = useCallback(
    (turnId: string) => void setModeParam({ kind: "plan", turnId }),
    [setModeParam],
  );
  const openContextPanel = useCallback(
    () => void setModeParam({ kind: "context" }),
    [setModeParam],
  );
  const closePanel = useCallback(() => void setModeParam(null), [setModeParam]);

  const value = useMemo<ThreadPanelValue>(
    () => ({
      mode,
      isOpen: isThreadPanelOpen(mode),
      openArtifactPanel,
      openSourcesPanel,
      openSearchPanel,
      openStepPanel,
      openPlanPanel,
      openContextPanel,
      closePanel,
      // Reflects the DetailSplitLayout / mobile toggle: opening from closed lands on
      // the default context panel; closing clears the URL param entirely.
      setOpen: (open) =>
        void setModeParam(
          open ? (isThreadPanelOpen(mode) ? mode : { kind: "context" }) : null,
        ),
    }),
    [
      mode,
      setModeParam,
      openArtifactPanel,
      openSourcesPanel,
      openSearchPanel,
      openStepPanel,
      openPlanPanel,
      openContextPanel,
      closePanel,
    ],
  );

  // Separate value so streaming `lookups` updates don't change the openers' identity.
  const dataValue = useMemo<ThreadPanelDataValue>(
    () => ({ lookups, registerLookups: setLookups }),
    [lookups],
  );

  return (
    <ThreadPanelContext.Provider value={value}>
      <ThreadPanelDataContext.Provider value={dataValue}>
        {children}
      </ThreadPanelDataContext.Provider>
    </ThreadPanelContext.Provider>
  );
}
