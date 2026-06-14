import {
  subagentPayloadSchema,
  toolEndPayloadSchema,
  toolStartPayloadSchema,
} from "@aqsha/agent-contracts";
import { describe, expect, it } from "vitest";
import { buildRunHooks, executeArtifactGateAllows } from "../src/agent/hooks";
import { qualifiedToolName } from "../src/agent/toolPolicy";
import { MemoryStore } from "../src/store/memoryStore";

const signal = { signal: new AbortController().signal };

function payloadOf(store: MemoryStore, runId: string, type: string) {
  return store
    .listRunEvents(runId)
    .then((events) =>
      events
        .filter((event) => event.type === type)
        .map((event) => JSON.parse(event.payloadJson) as Record<string, unknown>),
    );
}

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

  it("SubagentStop carries a sanitized last_assistant_message summary (Fase 5 v2)", async () => {
    const store = new MemoryStore();
    const hooks = buildRunHooks({ store, runId: "run1", threadId: "t1" });
    await hooks.SubagentStop?.[0]?.hooks[0]!(
      {
        hook_event_name: "SubagentStop",
        agent_type: "literature-searcher",
        agent_id: "a1",
        last_assistant_message:
          "Menemukan 5 studi relevan.\nRahasia: API_KEY=sk-999 /srv/secret",
      },
      undefined,
      signal,
    );
    const [payload] = await payloadOf(store, "run1", "subagent_stop");
    const parsed = subagentPayloadSchema.parse(payload);
    // Only the first line survives; the second line (key/path) never leaks.
    expect(parsed.summary).toBe("Menemukan 5 studi relevan.");
    expect(JSON.stringify(payload)).not.toContain("API_KEY");
    expect(JSON.stringify(payload)).not.toContain("/srv/secret");
  });

  it("SubagentStart never carries a summary", async () => {
    const store = new MemoryStore();
    const hooks = buildRunHooks({ store, runId: "run1", threadId: "t1" });
    await hooks.SubagentStart?.[0]?.hooks[0]!(
      {
        hook_event_name: "SubagentStart",
        agent_type: "literature-searcher",
        last_assistant_message: "should be ignored on start",
      },
      undefined,
      signal,
    );
    const [payload] = await payloadOf(store, "run1", "subagent_start");
    expect(subagentPayloadSchema.parse(payload).summary).toBeUndefined();
  });
});

describe("buildRunHooks — Fase 2 enrichment (sanitized payloads)", () => {
  function jsonResponse(value: unknown, isError = false) {
    return {
      content: [{ type: "text", text: JSON.stringify(value) }],
      ...(isError ? { isError: true } : {}),
    };
  }

  it("tool_start carries toolUseId + the clamped agent query (D6), never other secrets", async () => {
    const store = new MemoryStore();
    const hooks = buildRunHooks({ store, runId: "run1", threadId: "t1" });
    const preToolUse = hooks.PreToolUse?.[0]?.hooks[0]!;

    await preToolUse(
      {
        hook_event_name: "PreToolUse",
        tool_name: qualifiedToolName("searchWeb"),
        tool_input: { query: "meta-analisis olahraga dan kognisi", apiKey: "sk-secret-123" },
      },
      "tu_web",
      signal,
    );
    await preToolUse(
      {
        hook_event_name: "PreToolUse",
        tool_name: qualifiedToolName("lookupDoi"),
        tool_input: { doi: "10.1000/xyz" },
      },
      "tu_doi",
      signal,
    );

    const starts = await payloadOf(store, "run1", "tool_start");
    // D6: searchWeb surfaces the model-composed query (clamped) — and nothing
    // else from the input (the api key never rides along).
    expect(starts[0]).toEqual({
      toolName: "searchWeb",
      toolUseId: "tu_web",
      inputSummary: { query: "meta-analisis olahraga dan kognisi" },
    });
    // lookupDoi surfaces only the (public) DOI identifier.
    expect(starts[1]).toEqual({
      toolName: "lookupDoi",
      toolUseId: "tu_doi",
      inputSummary: { doi: "10.1000/xyz" },
    });
    // Every payload validates against the additive contract schema.
    for (const start of starts) {
      expect(toolStartPayloadSchema.safeParse(start).success).toBe(true);
    }
    const serialized = JSON.stringify(starts);
    expect(serialized).not.toContain("sk-secret-123");
  });

  it("tool_end sets status ok and a sanitized resultSummary on success", async () => {
    const store = new MemoryStore();
    const hooks = buildRunHooks({ store, runId: "run1", threadId: "t1" });
    const postToolUse = hooks.PostToolUse?.[0]?.hooks[0]!;

    await postToolUse(
      {
        hook_event_name: "PostToolUse",
        tool_name: qualifiedToolName("searchWeb"),
        tool_input: { query: "x" },
        tool_response: jsonResponse([{ title: "rahasia 1" }, { title: "rahasia 2" }]),
      },
      "tu_web",
      signal,
    );

    const [end] = await payloadOf(store, "run1", "tool_end");
    expect(end).toEqual({
      toolName: "searchWeb",
      toolUseId: "tu_web",
      status: "ok",
      resultSummary: { resultCount: 2 },
    });
    expect(toolEndPayloadSchema.safeParse(end).success).toBe(true);
    expect(JSON.stringify(end)).not.toContain("rahasia");
  });

  it("tool_end reports status error (and no result data) for an errored result", async () => {
    const store = new MemoryStore();
    const hooks = buildRunHooks({ store, runId: "run1", threadId: "t1" });
    const postToolUse = hooks.PostToolUse?.[0]?.hooks[0]!;

    await postToolUse(
      {
        hook_event_name: "PostToolUse",
        tool_name: qualifiedToolName("executeArtifact"),
        tool_input: { action: "create", title: "Doc" },
        tool_response: jsonResponse({ error: "Artifact write failed." }, true),
      },
      "tu_x",
      signal,
    );

    const [end] = await payloadOf(store, "run1", "tool_end");
    expect(end).toMatchObject({ toolName: "executeArtifact", status: "error" });
    expect(end).not.toHaveProperty("resultSummary");
  });

  it("PostToolUseFailure closes the tool as error without leaking the raw error", async () => {
    const store = new MemoryStore();
    const hooks = buildRunHooks({ store, runId: "run1", threadId: "t1" });
    const onFailure = hooks.PostToolUseFailure?.[0]?.hooks[0];
    expect(onFailure).toBeDefined();

    await onFailure!(
      {
        hook_event_name: "PostToolUseFailure",
        tool_name: qualifiedToolName("searchWeb"),
        tool_input: { query: "x" },
        error: "TypeError: cannot read property at /srv/app/providers/exa.ts:88",
      },
      "tu_web",
      signal,
    );

    const [end] = await payloadOf(store, "run1", "tool_end");
    expect(end).toEqual({ toolName: "searchWeb", toolUseId: "tu_web", status: "error" });
    expect(JSON.stringify(end)).not.toContain("/srv/app");
    expect(JSON.stringify(end)).not.toContain("TypeError");
  });

  it("subagent events carry both agentType and agentId", async () => {
    const store = new MemoryStore();
    const hooks = buildRunHooks({ store, runId: "run1", threadId: "t1" });
    await hooks.SubagentStart?.[0]?.hooks[0]!(
      {
        hook_event_name: "SubagentStart",
        agent_type: "literature-searcher",
        agent_id: "agent_42",
      },
      undefined,
      signal,
    );
    await hooks.SubagentStop?.[0]?.hooks[0]!(
      {
        hook_event_name: "SubagentStop",
        agent_type: "literature-searcher",
        agent_id: "agent_42",
      },
      undefined,
      signal,
    );

    const [start] = await payloadOf(store, "run1", "subagent_start");
    const [stop] = await payloadOf(store, "run1", "subagent_stop");
    expect(start).toEqual({ agentType: "literature-searcher", agentId: "agent_42" });
    expect(stop).toEqual({ agentType: "literature-searcher", agentId: "agent_42" });
    expect(subagentPayloadSchema.safeParse(start).success).toBe(true);
  });

  it("tool events carry parentAgentId from a sub-agent agent_id (absent on the main thread)", async () => {
    const store = new MemoryStore();
    const hooks = buildRunHooks({ store, runId: "run1", threadId: "t1" });
    const preToolUse = hooks.PreToolUse?.[0]?.hooks[0]!;
    const postToolUse = hooks.PostToolUse?.[0]?.hooks[0]!;
    const onFailure = hooks.PostToolUseFailure?.[0]?.hooks[0]!;

    // A tool called inside the literature-searcher sub-agent: the SDK sets
    // agent_id on the hook input (BaseHookInput.agent_id).
    await preToolUse(
      {
        hook_event_name: "PreToolUse",
        tool_name: qualifiedToolName("searchArxiv"),
        tool_input: { query: "x" },
        agent_id: "agent_lit_1",
      },
      "tu_sub",
      signal,
    );
    await postToolUse(
      {
        hook_event_name: "PostToolUse",
        tool_name: qualifiedToolName("searchArxiv"),
        tool_response: jsonResponse([{ title: "p" }]),
        agent_id: "agent_lit_1",
      },
      "tu_sub",
      signal,
    );
    // A main-thread tool call carries no agent_id → no parentAgentId.
    await preToolUse(
      {
        hook_event_name: "PreToolUse",
        tool_name: qualifiedToolName("searchWeb"),
        tool_input: { query: "y" },
      },
      "tu_main",
      signal,
    );
    // PostToolUseFailure inside the sub-agent also propagates the agent_id.
    await onFailure(
      {
        hook_event_name: "PostToolUseFailure",
        tool_name: qualifiedToolName("lookupDoi"),
        agent_id: "agent_lit_1",
      },
      "tu_fail",
      signal,
    );

    const starts = await payloadOf(store, "run1", "tool_start");
    const ends = await payloadOf(store, "run1", "tool_end");
    expect(starts.find((p) => p.toolUseId === "tu_sub")?.parentAgentId).toBe("agent_lit_1");
    expect(starts.find((p) => p.toolUseId === "tu_main")).not.toHaveProperty(
      "parentAgentId",
    );
    expect(ends.find((p) => p.toolUseId === "tu_sub")?.parentAgentId).toBe("agent_lit_1");
    expect(ends.find((p) => p.toolUseId === "tu_fail")?.parentAgentId).toBe("agent_lit_1");
    // Every enriched payload still validates against the additive schema.
    for (const start of starts) {
      expect(toolStartPayloadSchema.safeParse(start).success).toBe(true);
    }
    for (const end of ends) {
      expect(toolEndPayloadSchema.safeParse(end).success).toBe(true);
    }
  });
});
