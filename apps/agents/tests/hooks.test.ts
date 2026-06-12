import { describe, expect, it } from "vitest";
import { buildRunHooks, executeArtifactGateAllows } from "../src/agent/hooks";
import { qualifiedToolName } from "../src/agent/toolPolicy";
import { MemoryStore } from "../src/store/memoryStore";

async function approvedProposal(
  store: MemoryStore,
  payload: Record<string, unknown> = {},
) {
  const interaction = await store.createInteraction({
    ownerUserId: "u1",
    threadId: "t1",
    runId: "run1",
    type: "tool_approval",
    toolName: "proposeArtifact",
    payload,
  });
  await store.respondInteraction(interaction.id, { kind: "approval", approved: true });
}

describe("executeArtifactGateAllows", () => {
  it("denies when no approved proposeArtifact exists", async () => {
    const store = new MemoryStore();
    const gate = await executeArtifactGateAllows(store, "t1", { action: "create" });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("proposeArtifact");
  });

  it("allows a create after any approved proposal", async () => {
    const store = new MemoryStore();
    await approvedProposal(store);
    const gate = await executeArtifactGateAllows(store, "t1", { action: "create" });
    expect(gate.allowed).toBe(true);
  });

  it("requires the matching artifactId for updates", async () => {
    const store = new MemoryStore();
    await approvedProposal(store, { artifactId: "a1" });
    expect(
      (await executeArtifactGateAllows(store, "t1", { action: "update", artifactId: "a1" }))
        .allowed,
    ).toBe(true);
    expect(
      (await executeArtifactGateAllows(store, "t1", { action: "update", artifactId: "a2" }))
        .allowed,
    ).toBe(false);
  });

  it("a denied proposal does not open the gate", async () => {
    const store = new MemoryStore();
    const interaction = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run1",
      type: "tool_approval",
      toolName: "proposeArtifact",
      payload: {},
    });
    await store.respondInteraction(interaction.id, { kind: "approval", approved: false });
    const gate = await executeArtifactGateAllows(store, "t1", { action: "create" });
    expect(gate.allowed).toBe(false);
  });
});

describe("buildRunHooks", () => {
  it("PreToolUse denies an ungated executeArtifact and records events", async () => {
    const store = new MemoryStore();
    const hooks = buildRunHooks({ store, runId: "run1", threadId: "t1" });
    const preToolUse = hooks.PreToolUse?.[0]?.hooks[0];
    expect(preToolUse).toBeDefined();

    const denied = await preToolUse!(
      {
        hook_event_name: "PreToolUse",
        tool_name: qualifiedToolName("executeArtifact"),
        tool_input: { action: "create" },
      },
      "tu_1",
      { signal: new AbortController().signal },
    );
    expect(denied.hookSpecificOutput?.permissionDecision).toBe("deny");

    await approvedProposal(store);
    const allowed = await preToolUse!(
      {
        hook_event_name: "PreToolUse",
        tool_name: qualifiedToolName("executeArtifact"),
        tool_input: { action: "create" },
      },
      "tu_2",
      { signal: new AbortController().signal },
    );
    expect(allowed.hookSpecificOutput?.permissionDecision).toBeUndefined();

    const events = await store.listRunEvents("run1");
    expect(events.filter((event) => event.type === "tool_start")).toHaveLength(2);
  });

  it("Subagent hooks append run events", async () => {
    const store = new MemoryStore();
    const hooks = buildRunHooks({ store, runId: "run1", threadId: "t1" });
    await hooks.SubagentStart?.[0]?.hooks[0]!(
      { hook_event_name: "SubagentStart", agent_type: "planner" },
      undefined,
      { signal: new AbortController().signal },
    );
    const events = await store.listRunEvents("run1");
    expect(events[0]?.type).toBe("subagent_start");
    expect(JSON.parse(events[0]?.payloadJson ?? "{}").agentType).toBe("planner");
  });
});
