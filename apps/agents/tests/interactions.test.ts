import { describe, expect, it } from "vitest";
import {
  buildCanUseTool,
  InteractionBroker,
  resumePromptForInteraction,
} from "../src/agent/interactions";
import { qualifiedToolName } from "../src/agent/toolPolicy";
import { MemoryStore } from "../src/store/memoryStore";

const HOLD_MS = 40;

function setup() {
  const store = new MemoryStore();
  const broker = new InteractionBroker(store, HOLD_MS);
  return { store, broker };
}

const baseInput = {
  runId: "run1",
  threadId: "t1",
  ownerUserId: "u1",
};

describe("InteractionBroker.requestApproval (hold-window)", () => {
  it("resolves allow in-place when the user approves within the window", async () => {
    const { store, broker } = setup();
    const pending = broker.requestApproval({
      ...baseInput,
      toolName: "proposeArtifact",
      payload: { title: "Doc" },
    });
    // Respond shortly after creation.
    setTimeout(async () => {
      const rows = await store.listInteractions("t1");
      await store.respondInteraction(rows[0]!.id, {
        kind: "approval",
        approved: true,
      });
    }, 5);
    const result = await pending;
    expect(result.outcome).toBe("allow");
    // No interrupt was flagged.
    expect(broker.interruptState("run1")).toBeUndefined();
  });

  it("resolves deny with the user's note", async () => {
    const { store, broker } = setup();
    const pending = broker.requestApproval({
      ...baseInput,
      toolName: "deleteArtifact",
      payload: { artifactId: "a1" },
    });
    setTimeout(async () => {
      const rows = await store.listInteractions("t1");
      await store.respondInteraction(rows[0]!.id, {
        kind: "approval",
        approved: false,
        note: "jangan dihapus",
      });
    }, 5);
    const result = await pending;
    expect(result.outcome).toBe("deny");
    if (result.outcome === "deny") {
      expect(result.message).toContain("jangan dihapus");
    }
  });

  it("flags an interrupt when the hold window elapses", async () => {
    const { broker } = setup();
    let interrupted = false;
    broker.registerRun("run1", () => {
      interrupted = true;
    });
    const result = await broker.requestApproval({
      ...baseInput,
      toolName: "runComputation",
      payload: {},
    });
    expect(result.outcome).toBe("timeout");
    expect(interrupted).toBe(true);
    expect(broker.interruptState("run1")?.reason).toBe("approval_timeout");
    expect(broker.interruptState("run1")?.pendingInteractionId).toBe(
      result.interaction.id,
    );
  });

  it("consumes a primed approval on resume instead of opening a new window", async () => {
    const { store, broker } = setup();
    // Simulate the timeout → respond → resume flow: a responded interaction
    // is primed onto the run before the model retries the gated tool.
    const interaction = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run1",
      type: "tool_approval",
      toolName: "createWorkspace",
      payload: { name: "Spike" },
    });
    const responded = await store.respondInteraction(interaction.id, {
      kind: "approval",
      approved: true,
    });
    broker.primeResolvedApproval("run1", responded!);

    const result = await broker.requestApproval({
      ...baseInput,
      toolName: "createWorkspace",
      payload: { name: "Spike" },
    });
    expect(result.outcome).toBe("allow");
    // The timeline node opened on timeout must close: consuming the primed
    // approval emits interaction_resolved keyed by the same interaction id.
    const resolved = (await store.listRunEvents("run1")).filter(
      (eventRow) => eventRow.type === "interaction_resolved",
    );
    expect(resolved).toHaveLength(1);
    expect(JSON.parse(resolved[0]!.payloadJson).interactionId).toBe(interaction.id);
    // One-shot: a second call opens a fresh window (times out here).
    const second = await broker.requestApproval({
      ...baseInput,
      toolName: "createWorkspace",
      payload: { name: "Spike 2" },
    });
    expect(second.outcome).toBe("timeout");
  });

  it("primed denial denies the retry without a new interaction", async () => {
    const { store, broker } = setup();
    const interaction = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run1",
      type: "tool_approval",
      toolName: "deleteArtifact",
      payload: { artifactId: "a1" },
    });
    const responded = await store.respondInteraction(interaction.id, {
      kind: "approval",
      approved: false,
      note: "tidak jadi",
    });
    broker.primeResolvedApproval("run1", responded!);
    const result = await broker.requestApproval({
      ...baseInput,
      toolName: "deleteArtifact",
      payload: { artifactId: "a1" },
    });
    expect(result.outcome).toBe("deny");
    if (result.outcome === "deny") {
      expect(result.message).toContain("tidak jadi");
    }
    expect((await store.listInteractions("t1")).length).toBe(1);
  });
});

describe("InteractionBroker.requestAskUser", () => {
  it("persists the question card and interrupts immediately", async () => {
    const { store, broker } = setup();
    let interrupted = false;
    broker.registerRun("run1", () => {
      interrupted = true;
    });
    const interaction = await broker.requestAskUser({
      ...baseInput,
      questions: [
        {
          prompt: "Fokus bagian mana?",
          options: [
            { id: "a", label: "Metodologi" },
            { id: "b", label: "Hasil" },
          ],
        },
      ],
    });
    expect(interrupted).toBe(true);
    expect(broker.interruptState("run1")?.reason).toBe("ask_user");
    const stored = await store.getInteraction(interaction.id);
    expect(stored?.type).toBe("ask_user");
    expect(stored?.status).toBe("pending");
  });
});

describe("buildCanUseTool", () => {
  it("allows non-gated tools without creating interactions", async () => {
    const { store, broker } = setup();
    const canUseTool = buildCanUseTool({ broker, ...baseInput });
    const result = await canUseTool(qualifiedToolName("searchWeb"), { query: "x" });
    expect(result.behavior).toBe("allow");
    expect(await store.listInteractions("t1")).toHaveLength(0);
  });

  it("injects the structured workspace pick into the approved tool input", async () => {
    const { store, broker } = setup();
    const canUseTool = buildCanUseTool({ broker, ...baseInput });
    const pending = canUseTool(qualifiedToolName("proposeArtifact"), {
      action: "create",
      title: "Draf",
      workspaceId: "ws-model-pick",
    });
    setTimeout(async () => {
      const rows = await store.listInteractions("t1");
      await store.respondInteraction(rows[0]!.id, {
        kind: "approval",
        approved: true,
        workspaceId: "ws-user-pick",
      });
    }, 5);
    const result = await pending;
    expect(result.behavior).toBe("allow");
    if (result.behavior === "allow") {
      // The user's pick from the approval card overrides the model's.
      expect(result.updatedInput?.workspaceId).toBe("ws-user-pick");
      expect(result.updatedInput?.title).toBe("Draf");
    }
  });

  it("routes gated tools through approval and denies on decline", async () => {
    const { store, broker } = setup();
    const canUseTool = buildCanUseTool({ broker, ...baseInput });
    const pending = canUseTool(qualifiedToolName("createWorkspace"), { name: "Riset" });
    setTimeout(async () => {
      const rows = await store.listInteractions("t1");
      await store.respondInteraction(rows[0]!.id, {
        kind: "approval",
        approved: false,
      });
    }, 5);
    const result = await pending;
    expect(result.behavior).toBe("deny");
  });
});

describe("resumePromptForInteraction", () => {
  it("formats ask_user answers", async () => {
    const { store } = setup();
    const interaction = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run1",
      type: "ask_user",
      toolName: "askUser",
      payload: {},
    });
    const responded = await store.respondInteraction(interaction.id, {
      kind: "answers",
      answers: [{ prompt: "Fokus?", selectedOptionIds: ["a"], customAnswer: "metode" }],
    });
    const prompt = resumePromptForInteraction(responded!);
    expect(prompt).toContain("Fokus?");
    expect(prompt).toContain("selected: a");
    expect(prompt).toContain("metode");
  });

  it("formats approval and denial", async () => {
    const { store } = setup();
    const interaction = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run1",
      type: "tool_approval",
      toolName: "proposeArtifact",
      payload: {},
    });
    const approved = await store.respondInteraction(interaction.id, {
      kind: "approval",
      approved: true,
    });
    expect(resumePromptForInteraction(approved!)).toContain("approved");
    expect(resumePromptForInteraction(approved!)).toContain("proposeArtifact");
  });

  it("carries the structured workspace pick into the resume prompt", async () => {
    const { store } = setup();
    const interaction = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run1",
      type: "tool_approval",
      toolName: "proposeArtifact",
      payload: {},
    });
    const approved = await store.respondInteraction(interaction.id, {
      kind: "approval",
      approved: true,
      workspaceId: "ws-42",
    });
    const prompt = resumePromptForInteraction(approved!);
    expect(prompt).toContain("ws-42");
    expect(prompt).toContain("workspace");
  });
});

describe("approvedWorkspaceOverride", () => {
  it("returns the workspace pick of the LATEST approved proposeArtifact", async () => {
    const { store } = setup();
    const { approvedWorkspaceOverride } = await import("../src/tools/artifacts");
    const ctx = { store, threadId: "t1" };

    expect(await approvedWorkspaceOverride(ctx)).toBeUndefined();

    const first = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run1",
      type: "tool_approval",
      toolName: "proposeArtifact",
      payload: {},
    });
    await store.respondInteraction(first.id, {
      kind: "approval",
      approved: true,
      workspaceId: "ws-old",
    });
    const second = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run2",
      type: "tool_approval",
      toolName: "proposeArtifact",
      payload: {},
    });
    await store.respondInteraction(second.id, {
      kind: "approval",
      approved: true,
      workspaceId: "ws-new",
    });
    expect(await approvedWorkspaceOverride(ctx)).toBe("ws-new");
  });

  it("returns undefined when the latest approval has no workspace pick", async () => {
    const { store } = setup();
    const { approvedWorkspaceOverride } = await import("../src/tools/artifacts");
    const ctx = { store, threadId: "t1" };
    const interaction = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run1",
      type: "tool_approval",
      toolName: "proposeArtifact",
      payload: {},
    });
    await store.respondInteraction(interaction.id, {
      kind: "approval",
      approved: true,
    });
    expect(await approvedWorkspaceOverride(ctx)).toBeUndefined();
  });
});
