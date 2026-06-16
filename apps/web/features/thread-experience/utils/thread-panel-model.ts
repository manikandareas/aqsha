// Thread-detail right-panel mode (answer-stream redesign Fase 4).
//
// The thread-detail shell has ONE side-panel slot. Before Fase 4 it was a single
// `contextPanelOpen` boolean over the workspace-library / global-context panel.
// Fase 4 adds a third state — an artifact detail panel that REPLACES the library
// (with a "back to library" affordance) — so the boolean becomes a small mode:
//
//   closed ──openContext──▶ context ──openArtifact──▶ artifact
//     ▲          │              ▲   ▲                    │
//     └──close───┴──────────────┘   └──────back──────────┘
//
// Pure + unit-tested; the provider (`thread-panel-context.tsx`) only wires it to
// React state + the DetailSplitLayout open/close.

export type ThreadPanelMode =
  | { kind: "closed" }
  | { kind: "context" }
  | { kind: "artifact"; artifactId: string }
  // A sub-agent detail panel (its search steps + re-joined source links). Like
  // the artifact panel it REPLACES the library/context panel, with "back".
  | { kind: "subagent"; runId: string; subagentId: string };

export type ThreadPanelAction =
  | { type: "openContext" }
  | { type: "openArtifact"; artifactId: string }
  | { type: "openSubagent"; runId: string; subagentId: string }
  | { type: "back" }
  // `setOpen` reflects the DetailSplitLayout / mobile sidebar toggle: closing
  // collapses the panel; opening from closed lands on the default context panel
  // (never re-opening a stale artifact), opening while already open is a no-op.
  | { type: "setOpen"; open: boolean };

export const CLOSED_PANEL: ThreadPanelMode = { kind: "closed" };

export function threadPanelReducer(
  state: ThreadPanelMode,
  action: ThreadPanelAction,
): ThreadPanelMode {
  switch (action.type) {
    case "openContext":
      return { kind: "context" };
    case "openArtifact":
      return { kind: "artifact", artifactId: action.artifactId };
    case "openSubagent":
      return {
        kind: "subagent",
        runId: action.runId,
        subagentId: action.subagentId,
      };
    case "back":
      // From an artifact / sub-agent panel, "back" returns to the library panel.
      return { kind: "context" };
    case "setOpen":
      if (!action.open) return CLOSED_PANEL;
      return state.kind === "closed" ? { kind: "context" } : state;
    default:
      return state;
  }
}

export function isThreadPanelOpen(mode: ThreadPanelMode): boolean {
  return mode.kind !== "closed";
}
