import { describe, expect, it } from "vitest";
import {
  CLOSED_PANEL,
  isThreadPanelOpen,
  threadPanelReducer,
  type ThreadPanelMode,
} from "./thread-panel-model";

describe("threadPanelReducer", () => {
  it("opens the context (library) panel from closed", () => {
    expect(threadPanelReducer(CLOSED_PANEL, { type: "openContext" })).toEqual({
      kind: "context",
    });
  });

  it("opens the artifact panel, replacing the context panel", () => {
    const fromContext = threadPanelReducer(
      { kind: "context" },
      { type: "openArtifact", artifactId: "art_1" },
    );
    expect(fromContext).toEqual({ kind: "artifact", artifactId: "art_1" });
    // From closed directly (card click before the panel was ever opened).
    expect(
      threadPanelReducer(CLOSED_PANEL, { type: "openArtifact", artifactId: "art_2" }),
    ).toEqual({ kind: "artifact", artifactId: "art_2" });
  });

  it("opens the sub-agent panel, replacing the context panel", () => {
    expect(
      threadPanelReducer(CLOSED_PANEL, {
        type: "openSubagent",
        runId: "run_1",
        subagentId: "sub_1",
      }),
    ).toEqual({ kind: "subagent", runId: "run_1", subagentId: "sub_1" });
  });

  it("returns to the context panel via back (never closes)", () => {
    expect(
      threadPanelReducer({ kind: "artifact", artifactId: "art_1" }, { type: "back" }),
    ).toEqual({ kind: "context" });
    expect(
      threadPanelReducer(
        { kind: "subagent", runId: "run_1", subagentId: "sub_1" },
        { type: "back" },
      ),
    ).toEqual({ kind: "context" });
  });

  it("setOpen(false) closes from any mode", () => {
    const modes: ThreadPanelMode[] = [
      { kind: "context" },
      { kind: "artifact", artifactId: "art_1" },
    ];
    for (const mode of modes) {
      expect(threadPanelReducer(mode, { type: "setOpen", open: false })).toEqual(
        CLOSED_PANEL,
      );
    }
  });

  it("setOpen(true) opens the context panel from closed, but keeps an open mode", () => {
    expect(threadPanelReducer(CLOSED_PANEL, { type: "setOpen", open: true })).toEqual({
      kind: "context",
    });
    // Toggling open while showing an artifact must NOT drop back to context.
    const artifact: ThreadPanelMode = { kind: "artifact", artifactId: "art_1" };
    expect(threadPanelReducer(artifact, { type: "setOpen", open: true })).toBe(artifact);
  });
});

describe("isThreadPanelOpen", () => {
  it("is false only when closed", () => {
    expect(isThreadPanelOpen(CLOSED_PANEL)).toBe(false);
    expect(isThreadPanelOpen({ kind: "context" })).toBe(true);
    expect(isThreadPanelOpen({ kind: "artifact", artifactId: "a" })).toBe(true);
  });
});
