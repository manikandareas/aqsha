import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import {
  buildExecuteArtifactGate,
  hasApprovedArtifactProposal,
} from "../convex/agent/hitl/executeArtifactGate";

// AUD-01: executeArtifact must stay inert until an approved proposeArtifact is in
// the conversation. These lock the pure detector + the prepareStep override it
// drives, so a model can never write an unapproved artifact on an unrelated resume.

const msg = (role: string, content: unknown): ModelMessage =>
  ({ role, content }) as unknown as ModelMessage;

describe("hasApprovedArtifactProposal", () => {
  it("true when a proposeArtifact tool-call is present", () => {
    const messages = [
      msg("user", "make me a summary doc"),
      msg("assistant", [
        { type: "tool-call", toolCallId: "c1", toolName: "proposeArtifact", input: {} },
      ]),
    ];
    expect(hasApprovedArtifactProposal(messages)).toBe(true);
  });

  it("true when a proposeArtifact tool-result is present (approved + executed)", () => {
    const messages = [
      msg("tool", [
        { type: "tool-result", toolCallId: "c1", toolName: "proposeArtifact", output: {} },
      ]),
    ];
    expect(hasApprovedArtifactProposal(messages)).toBe(true);
  });

  it("false for an unrelated resume (askUser / runComputation only)", () => {
    const messages = [
      msg("assistant", [
        { type: "tool-call", toolCallId: "c1", toolName: "askUser", input: {} },
      ]),
      msg("tool", [
        { type: "tool-result", toolCallId: "c2", toolName: "runComputation", output: {} },
      ]),
      msg("user", "yes please"),
    ];
    expect(hasApprovedArtifactProposal(messages)).toBe(false);
  });

  it("false for plain string-content messages", () => {
    expect(hasApprovedArtifactProposal([msg("user", "hello")])).toBe(false);
  });
});

describe("buildExecuteArtifactGate", () => {
  const tools = ["searchWeb", "proposeArtifact", "executeArtifact", "askUser"];

  it("withholds executeArtifact when no approved proposal exists", () => {
    const gate = buildExecuteArtifactGate(tools);
    const out = gate({ messages: [msg("user", "hi")] });
    expect(out.activeTools).toEqual(["searchWeb", "proposeArtifact", "askUser"]);
    expect(out.activeTools).not.toContain("executeArtifact");
  });

  it("does not override (all tools active) once a proposal is approved", () => {
    const gate = buildExecuteArtifactGate(tools);
    const out = gate({
      messages: [
        msg("tool", [
          { type: "tool-result", toolCallId: "c1", toolName: "proposeArtifact", output: {} },
        ]),
      ],
    });
    expect(out).toEqual({});
  });
});
