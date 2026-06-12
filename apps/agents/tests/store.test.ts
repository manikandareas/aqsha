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

    await store.searchThreadDocuments("t1", "q");
    expect(calls.some((c) => c.kind === "action")).toBe(true);
  });

  it("waitForResponse polls until responded or the window elapses", async () => {
    let status: "pending" | "responded" = "pending";
    const caller = {
      query: vi.fn(async () => ({
        id: "int1",
        ownerUserId: "u1",
        threadId: "t1",
        runId: "r1",
        type: "tool_approval",
        toolName: "proposeArtifact",
        payload: {},
        status,
        createdAt: 0,
      })),
      mutation: vi.fn(async () => null),
      action: vi.fn(async () => null),
    };
    let now = 0;
    const sleep = async (ms: number) => {
      now += ms;
      if (now >= 3_000) {
        status = "responded";
      }
    };
    const store = new ConvexStore(caller, "svc", sleep, () => now);

    const responded = await store.waitForResponse("int1", 10_000);
    expect(responded?.status).toBe("responded");

    // Times out when nothing changes.
    status = "pending";
    now = 0;
    const slowSleep = async (ms: number) => {
      now += ms;
    };
    const store2 = new ConvexStore(caller, "svc", slowSleep, () => now);
    expect(await store2.waitForResponse("int1", 4_000)).toBeNull();
  });
});
