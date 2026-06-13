import { describe, expect, it } from "vitest";
import {
  uiHitlMessageFromInteraction,
  uiMessageFromRow,
  uiRunFromRow,
} from "../src/uiAdapters";

describe("uiMessageFromRow", () => {
  it("maps status and produces a text part", () => {
    const message = uiMessageFromRow({
      messageId: "m1",
      role: "assistant",
      text: "halo",
      status: "complete",
      createdAt: 42,
    });
    expect(message).toMatchObject({
      id: "m1",
      role: "assistant",
      status: "success",
      order: 42,
      text: "halo",
      parts: [{ type: "text", text: "halo" }],
    });
    expect(
      uiMessageFromRow({
        messageId: "m2",
        role: "assistant",
        text: "",
        status: "streaming",
        createdAt: 43,
      }).status,
    ).toBe("streaming");
  });
});

describe("uiHitlMessageFromInteraction", () => {
  it("renders ask_user as a pending tool-askUser part (hitl-parts contract)", () => {
    const message = uiHitlMessageFromInteraction({
      id: "int1",
      runId: "r1",
      type: "ask_user",
      toolName: "askUser",
      payloadJson: JSON.stringify({ questions: [{ prompt: "Jenjang?" }] }),
      createdAt: 10,
    });
    const part = message.parts![0]!;
    // These three fields are what utils/hitl-parts.ts keys on; changing them
    // silently hides every HITL card on the sdk backend.
    expect(part.type).toBe("tool-askUser");
    expect(part.state).toBe("input-available");
    expect(part.toolCallId).toBe("int1");
    expect(part.input).toMatchObject({ questions: [{ prompt: "Jenjang?" }] });
  });

  it("renders tool_approval as approval-requested with approval.id", () => {
    const message = uiHitlMessageFromInteraction({
      id: "int2",
      runId: "r1",
      type: "tool_approval",
      toolName: "proposeArtifact",
      payloadJson: JSON.stringify({ title: "Draf" }),
      createdAt: 11,
    });
    const part = message.parts![0]!;
    expect(part.type).toBe("tool-proposeArtifact");
    expect(part.state).toBe("approval-requested");
    expect(part.approval).toEqual({ id: "int2" });
  });

  it("degrades to an empty input on malformed payload JSON", () => {
    const message = uiHitlMessageFromInteraction({
      id: "int3",
      runId: "r1",
      type: "tool_approval",
      toolName: "createWorkspace",
      payloadJson: "not-json",
      createdAt: 12,
    });
    expect(message.parts![0]!.input).toEqual({});
  });
});

describe("uiRunFromRow", () => {
  it("maps run + events into the ResearchRun shape with a normalized activity timeline", () => {
    const run = uiRunFromRow({
      runId: "run1",
      status: "completed",
      mode: "deep",
      agentKind: "pro",
      createdAt: 1,
      updatedAt: 9,
      events: [
        {
          id: "run1:0",
          seq: 0,
          type: "subagent_start",
          payloadJson: JSON.stringify({ agentType: "literature-searcher" }),
          createdAt: 2,
        },
        {
          id: "run1:1",
          seq: 1,
          type: "tool_start",
          payloadJson: JSON.stringify({ toolName: "searchWeb" }),
          createdAt: 3,
        },
      ],
    });
    expect(run).toMatchObject({
      _id: "run1",
      executionKind: "workflow",
      status: "completed",
      retryable: false,
      completedAt: 9,
    });
    // The single rendered representation is `activity` (the orphaned `events`
    // mirror was removed in the Fase-3 cleanup).
    const runNode = run.activity.find((node) => node.type === "run");
    expect(runNode?.status).toBe("completed");
    const subagent = run.activity.find((node) => node.type === "subagent");
    expect(subagent?.title).toContain("literatur");
  });
});
