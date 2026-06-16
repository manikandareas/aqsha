import { describe, expect, it } from "vitest";
import {
  buildCanUseTool,
  InteractionBroker,
  resumePromptForInteraction,
} from "../src/agent/interactions";
import { qualifiedToolName } from "../src/agent/toolPolicy";
import { MemoryStore } from "../src/store/memoryStore";

function setup() {
  const store = new MemoryStore();
  const broker = new InteractionBroker(store);
  return { store, broker };
}

const baseInput = {
  runId: "run1",
  threadId: "t1",
  ownerUserId: "u1",
};

describe("InteractionBroker.requestApproval (immediate interrupt)", () => {
  it("creates the pending row and interrupts the run on the first pass", async () => {
    const { store, broker } = setup();
    let interrupted = false;
    broker.registerRun("run1", () => {
      interrupted = true;
    });
    const result = await broker.requestApproval({
      ...baseInput,
      toolName: "proposeArtifact",
      payload: { title: "Doc" },
    });
    expect(result.outcome).toBe("interrupt");
    expect(interrupted).toBe(true);
    expect(broker.interruptState("run1")?.reason).toBe("approval");
    expect(broker.interruptState("run1")?.pendingInteractionId).toBe(
      result.interaction.id,
    );
    // The pending interaction survives for the resume path.
    const rows = await store.listInteractions("t1");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("pending");
    // interaction_pending is emitted (no in-place resolve on the first pass).
    const events = await store.listRunEvents("run1");
    expect(events.some((e) => e.type === "interaction_pending")).toBe(true);
    expect(events.some((e) => e.type === "interaction_resolved")).toBe(false);
  });

  it("consumes a primed approval on resume instead of interrupting again", async () => {
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
    // One-shot: a second call has no primed approval, so it interrupts again.
    const second = await broker.requestApproval({
      ...baseInput,
      toolName: "createWorkspace",
      payload: { name: "Spike 2" },
    });
    expect(second.outcome).toBe("interrupt");
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

describe("InteractionBroker — proposeResearchPlan plan gate", () => {
  it("interrupts with reason 'plan_review' and preserves the plan payload", async () => {
    const { store, broker } = setup();
    let interrupted = false;
    broker.registerRun("run1", () => {
      interrupted = true;
    });
    const payload = {
      title: "Dampak AI",
      summary: "Tinjauan",
      questions: ["a", "b", "c"],
    };
    const result = await broker.requestApproval({
      ...baseInput,
      toolName: "proposeResearchPlan",
      payload,
    });
    expect(result.outcome).toBe("interrupt");
    expect(interrupted).toBe(true);
    expect(broker.interruptState("run1")?.reason).toBe("plan_review");
    const stored = await store.getInteraction(result.interaction.id);
    expect(stored).toMatchObject({
      type: "tool_approval",
      toolName: "proposeResearchPlan",
      payload,
    });
  });

  it("does NOT prime a plan_decision response (no silent no-op on revise)", async () => {
    const { store, broker } = setup();
    const interaction = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run1",
      type: "tool_approval",
      toolName: "proposeResearchPlan",
      payload: { title: "T", questions: ["a", "b", "c"] },
    });
    const responded = await store.respondInteraction(interaction.id, {
      kind: "plan_decision",
      decision: "revise",
      revisionInstruction: "fokus 2023",
    });
    broker.primeResolvedApproval("run1", responded!);
    // The plan_decision must NOT have been primed: the next gated call interrupts
    // again rather than consuming a stale primed approval.
    const result = await broker.requestApproval({
      ...baseInput,
      toolName: "proposeResearchPlan",
      payload: { title: "T", questions: ["a", "b", "c"] },
    });
    expect(result.outcome).toBe("interrupt");
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

  it("interrupts on the first pass and denies so the SDK does not execute", async () => {
    const { store, broker } = setup();
    broker.registerRun("run1", () => {});
    const canUseTool = buildCanUseTool({ broker, ...baseInput });
    const result = await canUseTool(qualifiedToolName("createWorkspace"), {
      name: "Riset",
    });
    expect(result.behavior).toBe("deny");
    // One pending interaction is created and the run is flagged for interrupt.
    expect(await store.listInteractions("t1")).toHaveLength(1);
    expect(broker.interruptState("run1")?.reason).toBe("approval");
  });

  it("injects the structured workspace pick from a primed approval on resume", async () => {
    const { store, broker } = setup();
    // Resume path: the responded interaction (with the user's workspace pick) is
    // primed before the model retries the gated tool.
    const interaction = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run1",
      type: "tool_approval",
      toolName: "proposeArtifact",
      payload: {},
    });
    const responded = await store.respondInteraction(interaction.id, {
      kind: "approval",
      approved: true,
      workspaceId: "ws-user-pick",
    });
    broker.primeResolvedApproval("run1", responded!);

    const canUseTool = buildCanUseTool({ broker, ...baseInput });
    const result = await canUseTool(qualifiedToolName("proposeArtifact"), {
      action: "create",
      title: "Draf",
      workspaceId: "ws-model-pick",
    });
    expect(result.behavior).toBe("allow");
    if (result.behavior === "allow") {
      // The user's pick from the approval card overrides the model's.
      expect(result.updatedInput?.workspaceId).toBe("ws-user-pick");
      expect(result.updatedInput?.title).toBe("Draf");
    }
  });

  it("denies the retry from a primed denial", async () => {
    const { store, broker } = setup();
    const interaction = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run1",
      type: "tool_approval",
      toolName: "createWorkspace",
      payload: { name: "Riset" },
    });
    const responded = await store.respondInteraction(interaction.id, {
      kind: "approval",
      approved: false,
    });
    broker.primeResolvedApproval("run1", responded!);
    const canUseTool = buildCanUseTool({ broker, ...baseInput });
    const result = await canUseTool(qualifiedToolName("createWorkspace"), {
      name: "Riset",
    });
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

  it("formats a plan_decision revise as a re-plan instruction", async () => {
    const { store } = setup();
    const interaction = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run1",
      type: "tool_approval",
      toolName: "proposeResearchPlan",
      payload: { title: "T", questions: ["a", "b", "c"] },
    });
    const revise = await store.respondInteraction(interaction.id, {
      kind: "plan_decision",
      decision: "revise",
      revisionInstruction: "fokuskan ke studi 2023",
    });
    const prompt = resumePromptForInteraction(revise!);
    expect(prompt).toContain("fokuskan ke studi 2023");
    expect(prompt).toContain("proposeResearchPlan");
    // It must NOT be mis-rendered as the approval/declined template.
    expect(prompt).not.toContain("declined");
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
