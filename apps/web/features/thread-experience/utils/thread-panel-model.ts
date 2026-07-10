// Thread-detail right-panel mode (clickable message-part detail panels).
//
// The thread-detail shell has ONE side-panel slot, now a HOME for several panels behind
// a tab strip (Workspace · Sumber · Statistik(soon) · Pratinjau). Every mode maps to one
// tab (`threadPanelTabOf`): `context` → Workspace, `sources` → Sumber, and all the
// message-part detail modes (artifact / search / step / plan / questions) share the
// single Pratinjau slot — clicking a card replaces the preview, closing the panel drops
// it. Mode lives in the URL (nuqs, one `panel` query param) so panels are deep-linkable
// and survive refresh.
//
// Detail modes never open a single source — sources always open their own URL.
// The panels list sources (aggregate / message-level / sub-question / step) with each
// item linking out.

import { createParser } from "nuqs";

export type ThreadPanelMode =
  | { kind: "closed" }
  | { kind: "context" }
  | { kind: "artifact"; artifactId: string }
  // Thread sources — aggregate (no `messageId`) or scoped to one assistant message
  // (the "Sumber" trigger under an answer).
  | { kind: "sources"; messageId?: string }
  // One `/deep` sub-question search step — scoped to its run (`turnId`) so multiple
  // `/deep` runs in one thread don't share a sub-question index.
  | { kind: "search"; turnId: string; subQuestionIndex: number }
  // Any other expandable tool step (verify, counter-evidence, normal-chat search) by tool-call id.
  | { kind: "step"; toolCallId: string }
  // The research plan of one run (`turnId`) — prose + sub-questions, plus the gate
  // actions when that run is the live gate (turnId = `LIVE_PLAN_KEY`).
  | { kind: "plan"; turnId: string }
  // The live ask-gate (klarifikasi `ask_questions`) — interactive questions form. Only
  // one live gate at a time, so no id is needed.
  | { kind: "questions" };

export const CLOSED_PANEL: ThreadPanelMode = { kind: "closed" };

/** Sentinel run id for the live `/deep` plan gate (no persisted report/runId yet on the FE). */
export const LIVE_PLAN_KEY = "__live__";

export function isThreadPanelOpen(mode: ThreadPanelMode): boolean {
  return mode.kind !== "closed";
}

/** The side panel's tab strip entries — every open mode belongs to exactly one. */
export type ThreadPanelTab = "workspace" | "sources" | "preview";

/**
 * Message-part detail modes share the single Pratinjau (preview) slot: opening another
 * card replaces the preview, it never stacks.
 */
export function isThreadPanelPreviewMode(mode: ThreadPanelMode): boolean {
  return (
    mode.kind === "artifact" ||
    mode.kind === "search" ||
    mode.kind === "step" ||
    mode.kind === "plan" ||
    mode.kind === "questions"
  );
}

/** Which tab an open mode lives under (`null` when the panel is closed). */
export function threadPanelTabOf(mode: ThreadPanelMode): ThreadPanelTab | null {
  if (mode.kind === "closed") return null;
  if (mode.kind === "context") return "workspace";
  if (mode.kind === "sources") return "sources";
  return "preview";
}

// URL encoding for the single `panel` query param. Closed = param absent.
//   context → "c" · plan → "p:<turnId>" · artifact → "a:<id>"
//   sources → "m" (aggregate) / "m:<messageId>" (message-scoped)
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
      return mode.messageId ? `m:${mode.messageId}` : "m";
    case "search":
      return `q:${mode.turnId}:${mode.subQuestionIndex}`;
    case "step":
      return `t:${mode.toolCallId}`;
    case "questions":
      return "x";
    case "closed":
      return null;
  }
}

export function parseThreadPanelMode(raw: string): ThreadPanelMode {
  if (raw === "c") return { kind: "context" };
  if (raw === "x") return { kind: "questions" };
  // Aggregate thread sources.
  if (raw === "m") return { kind: "sources" };
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
    // Empty id ("m:", a hand-trimmed link) reads as the aggregate sources tab.
    return id ? { kind: "sources", messageId: id } : { kind: "sources" };
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
