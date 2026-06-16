import { describe, expect, it, vi } from "vitest";
import { ConvexStore, SERVICE_FUNCTIONS } from "../src/store/convexStore";
import { MemoryStore } from "../src/store/memoryStore";

describe("MemoryStore artifact + workspace actions", () => {
  it("create / update / delete artifacts with ownership checks", async () => {
    const store = new MemoryStore();
    const created = await store.applyArtifactAction("u1", "t1", {
      action: "create",
      title: "Draft",
      content: "Isi draft",
    });
    expect(created.ok).toBe(true);
    const artifactId = created.artifactId!;

    const updated = await store.applyArtifactAction("u1", "t1", {
      action: "update",
      artifactId,
      title: "Draft v2",
      content: "Isi baru",
    });
    expect(updated.ok).toBe(true);
    expect((await store.getArtifact(artifactId))?.title).toBe("Draft v2");

    // Another user cannot touch it.
    const stranger = await store.applyArtifactAction("u2", "t1", {
      action: "delete",
      artifactId,
    });
    expect(stranger.ok).toBe(false);

    const deleted = await store.applyArtifactAction("u1", "t1", {
      action: "delete",
      artifactId,
    });
    expect(deleted.ok).toBe(true);
    expect(await store.getArtifact(artifactId)).toBeNull();
  });

  it("workspace create + rename and manifest listing", async () => {
    const store = new MemoryStore();
    const created = await store.applyWorkspaceAction("u1", {
      action: "create",
      name: "Riset LLM",
    });
    expect(created.ok).toBe(true);
    const workspaceId = created.workspaceId!;

    await store.applyArtifactAction("u1", "t1", {
      action: "create",
      title: "Paper A",
      content: "Isi",
      workspaceId,
    });

    const manifests = await store.getWorkspaceManifests("u1", [workspaceId]);
    expect(manifests[0]?.name).toBe("Riset LLM");
    expect(manifests[0]?.items).toHaveLength(1);

    const renamed = await store.applyWorkspaceAction("u1", {
      action: "rename",
      workspaceId,
      name: "Riset LLM 2026",
    });
    expect(renamed.ok).toBe(true);
    expect(
      (await store.getWorkspaceManifests("u1", [workspaceId]))[0]?.name,
    ).toBe("Riset LLM 2026");
  });

  it("searchThreadDocuments ranks seeded artifacts by term overlap", async () => {
    const store = new MemoryStore();
    store.seedArtifact({
      artifactId: "a1",
      ownerUserId: "u1",
      title: "Transformer paper",
      text: "attention mechanism in transformers",
    });
    store.seedArtifact({
      artifactId: "a2",
      ownerUserId: "u1",
      title: "Cooking notes",
      text: "how to bake bread",
    });
    const result = await store.searchThreadDocuments("t1", "transformer attention");
    expect(result).toContain("a1");
    expect(result).not.toContain("a2");
  });
});

describe("ConvexStore", () => {
  it("attaches the service token and serializes payloads", async () => {
    const calls: Array<{ kind: string; path: string; args: Record<string, unknown> }> = [];
    const caller = {
      query: vi.fn(async (path: string, args: Record<string, unknown>) => {
        calls.push({ kind: "query", path, args });
        return null;
      }),
      mutation: vi.fn(async (path: string, args: Record<string, unknown>) => {
        calls.push({ kind: "mutation", path, args });
        return { runId: "run1" };
      }),
      action: vi.fn(async (path: string, args: Record<string, unknown>) => {
        calls.push({ kind: "action", path, args });
        return "excerpt";
      }),
    };
    const store = new ConvexStore(caller, "svc-token");

    await store.getThread("t1");
    expect(calls[0]).toMatchObject({
      kind: "query",
      path: SERVICE_FUNCTIONS.getThread,
      args: { threadId: "t1", serviceToken: "svc-token" },
    });

    await store.appendRunEvent({ runId: "r1", type: "tool_start", payload: { a: 1 } });
    const eventCall = calls.find((c) => c.path === SERVICE_FUNCTIONS.appendRunEvent)!;
    expect(eventCall.args.payloadJson).toBe(JSON.stringify({ a: 1 }));

    // The Convex endpoint validates args exactly: only payloadJson may cross
    // the wire — a stray `payload` object is an ArgumentValidationError.
    await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "r1",
      type: "tool_approval",
      toolName: "createWorkspace",
      payload: { name: "Riset" },
    });
    const interactionCall = calls.find(
      (c) => c.path === SERVICE_FUNCTIONS.createInteraction,
    )!;
    expect(interactionCall.args.payloadJson).toBe(JSON.stringify({ name: "Riset" }));
    expect("payload" in interactionCall.args).toBe(false);

    await store.searchThreadDocuments("t1", "q");
    expect(calls.some((c) => c.kind === "action")).toBe(true);
  });

  it("routes insertSources to the service path and skips an empty batch", async () => {
    const calls: Array<{ path: string; args: Record<string, unknown> }> = [];
    const caller = {
      query: vi.fn(async () => null),
      mutation: vi.fn(async (path: string, args: Record<string, unknown>) => {
        calls.push({ path, args });
        return { inserted: 0 };
      }),
      action: vi.fn(async () => "x"),
    };
    const store = new ConvexStore(caller, "svc-token");

    // Empty batch is a no-op (no wire call).
    await store.insertSources({
      runId: "r1",
      threadId: "t1",
      ownerUserId: "u1",
      sources: [],
    });
    expect(calls).toHaveLength(0);

    await store.insertSources({
      runId: "r1",
      threadId: "t1",
      ownerUserId: "u1",
      sources: [
        {
          citationNumber: 1,
          origin: "web",
          evidenceStrength: "medium",
          title: "S1",
          locator: "l1",
          snippet: "s1",
          discoveryQuery: "ai tutoring",
        },
      ],
    });
    const call = calls.find((c) => c.path === SERVICE_FUNCTIONS.insertSources)!;
    expect(call.args).toMatchObject({
      runId: "r1",
      threadId: "t1",
      ownerUserId: "u1",
      serviceToken: "svc-token",
    });
  });
});

describe("MemoryStore research sources (WS6)", () => {
  it("appends sources per run and dedupe is left to the read side", async () => {
    const store = new MemoryStore();
    await store.insertSources({
      runId: "r1",
      threadId: "t1",
      ownerUserId: "u1",
      sources: [
        {
          citationNumber: 1,
          origin: "web",
          evidenceStrength: "medium",
          title: "S1",
          locator: "l1",
          snippet: "s1",
          discoveryQuery: "ai tutoring",
        },
      ],
    });
    await store.insertSources({
      runId: "r1",
      threadId: "t1",
      ownerUserId: "u1",
      sources: [
        {
          citationNumber: 2,
          origin: "arxiv",
          evidenceStrength: "strong",
          title: "S2",
          locator: "l2",
          snippet: "s2",
          discoveryQuery: "ai tutoring",
        },
      ],
    });
    // Empty batch is a no-op.
    await store.insertSources({
      runId: "r1",
      threadId: "t1",
      ownerUserId: "u1",
      sources: [],
    });

    const stored = store.getSources("r1");
    expect(stored.map((s) => s.citationNumber)).toEqual([1, 2]);
    expect(stored.every((s) => s.discoveryQuery === "ai tutoring")).toBe(true);
    expect(store.getSources("other")).toEqual([]);
  });
});
