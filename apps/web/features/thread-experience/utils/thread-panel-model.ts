// Thread-detail right-panel mode (clickable message-part detail panels).
//
// The thread-detail shell has ONE side-panel slot. The default is the workspace
// `context` panel; clicking a message part swaps the slot to a detail view that
// REPLACES it. Closing the panel collapses the slot entirely (no back-to-context
// step — the header toggle reopens context). Mode lives in the URL (nuqs, one
// `panel` query param) so detail panels are deep-linkable and survive refresh.
//
// Detail modes never open a single source — sources always open their own URL.
// The panels list sources (message-level / sub-question / step) with each item
// linking out.

import { createParser } from "nuqs";

export type ThreadPanelMode =
  | { kind: "closed" }
  | { kind: "context" }
  | { kind: "artifact"; artifactId: string }
  // All sources collected for one assistant message (the "Sumber" trigger).
  | { kind: "sources"; messageId: string }
  // One `/deep` sub-question search step — scoped to its run (`turnId`) so multiple
  // `/deep` runs in one thread don't share a sub-question index.
  | { kind: "search"; turnId: string; subQuestionIndex: number }
  // Any other expandable tool step (verify, counter-evidence, normal-chat search) by tool-call id.
  | { kind: "step"; toolCallId: string }
  // The research plan of one run (`turnId`) — prose + sub-questions, plus the gate
  // actions when that run is the live gate (turnId = `LIVE_PLAN_KEY`).
  | { kind: "plan"; turnId: string };

export const CLOSED_PANEL: ThreadPanelMode = { kind: "closed" };

/** Sentinel run id for the live `/deep` plan gate (no persisted report/runId yet on the FE). */
export const LIVE_PLAN_KEY = "__live__";

export function isThreadPanelOpen(mode: ThreadPanelMode): boolean {
  return mode.kind !== "closed";
}

// URL encoding for the single `panel` query param. Closed = param absent.
//   context → "c" · plan → "p:<turnId>" · artifact → "a:<id>" · sources → "m:<messageId>"
//   search → "q:<turnId>:<index>" · step → "t:<toolCallId>"
// Id-bearing modes split on the FIRST ":" so ids that contain their own colons round-trip
// intact; `search` keeps the trailing numeric index after the LAST ":" (turnId before it).
export function serializeThreadPanelMode(mode: ThreadPanelMode): string | null {
  switch (mode.kind) {
    case "context":
      return "c";
    case "plan":
      return `p:${mode.turnId}`;
    case "artifact":
      return `a:${mode.artifactId}`;
    case "sources":
      return `m:${mode.messageId}`;
    case "search":
      return `q:${mode.turnId}:${mode.subQuestionIndex}`;
    case "step":
      return `t:${mode.toolCallId}`;
    case "closed":
      return null;
  }
}

export function parseThreadPanelMode(raw: string): ThreadPanelMode {
  if (raw === "c") return { kind: "context" };
  if (raw.startsWith("p:")) {
    const turnId = raw.slice(2);
    return turnId ? { kind: "plan", turnId } : CLOSED_PANEL;
  }
  if (raw.startsWith("a:")) {
    const id = raw.slice(2);
    return id ? { kind: "artifact", artifactId: id } : CLOSED_PANEL;
  }
  if (raw.startsWith("m:")) {
    const id = raw.slice(2);
    return id ? { kind: "sources", messageId: id } : CLOSED_PANEL;
  }
  if (raw.startsWith("t:")) {
    const id = raw.slice(2);
    return id ? { kind: "step", toolCallId: id } : CLOSED_PANEL;
  }
  if (raw.startsWith("q:")) {
    // `<turnId>:<index>` — index is the trailing run of digits after the LAST ":".
    const rest = raw.slice(2);
    const sep = rest.lastIndexOf(":");
    if (sep <= 0) return CLOSED_PANEL;
    const turnId = rest.slice(0, sep);
    const idxRaw = rest.slice(sep + 1);
    // Strict digits only — reject "", "1e3", "0x5", " 1", etc. (Number() coerces those to
    // valid indices and would open the wrong / a nonexistent sub-question panel).
    if (!turnId || !/^\d+$/.test(idxRaw)) return CLOSED_PANEL;
    return { kind: "search", turnId, subQuestionIndex: Number.parseInt(idxRaw, 10) };
  }
  return CLOSED_PANEL;
}

// nuqs parser: `null` (param absent / invalid) reads back as the closed panel.
export const parseAsThreadPanelMode = createParser<ThreadPanelMode>({
  parse(raw) {
    const mode = parseThreadPanelMode(raw);
    return mode.kind === "closed" ? null : mode;
  },
  serialize(mode) {
    return serializeThreadPanelMode(mode) ?? "";
  },
});
