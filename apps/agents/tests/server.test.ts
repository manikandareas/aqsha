import { describe, expect, it } from "vitest";
import type { BridgeMessage } from "../src/agent/streamBridge";
import { loadConfig } from "../src/config";
import { RunManager, type QueryRunner } from "../src/runs/runManager";
import { createApp } from "../src/server";
import { MemoryStore } from "../src/store/memoryStore";

const TOKEN = "secret-token";

function completedRunner(): QueryRunner {
  return () => ({
    stream: (async function* (): AsyncGenerator<BridgeMessage> {
      yield { type: "system", subtype: "init", session_id: "sess_1" };
      yield {
        type: "assistant",
        message: { content: [{ type: "text", text: "ok" }] },
      };
      yield { type: "result", subtype: "success", session_id: "sess_1", result: "ok" };
    })(),
    interrupt: async () => {},
  });
}

function setup() {
  const config = loadConfig({
    AGENTS_SERVICE_TOKEN: TOKEN,
    AGENTS_HOLD_WINDOW_MS: "40",
  });
  const store = new MemoryStore();
  const runManager = new RunManager({ store, config, runner: completedRunner() });
  const app = createApp({ config, store, runManager });
  const fetchJson = (
    path: string,
    init?: RequestInit & { auth?: boolean },
  ): Promise<Response> =>
    Promise.resolve(
      app.request(path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.auth === false ? {} : { Authorization: `Bearer ${TOKEN}` }),
          ...(init?.headers ?? {}),
        },
      }),
    );
  return { app, store, runManager, fetchJson };
}

const RUN_BODY = {
  runId: "run1",
  threadId: "t1",
  ownerUserId: "u1",
  agentKind: "lite",
  prompt: "Halo",
};

describe("server", () => {
  it("/healthz is open; everything else needs the service token", async () => {
    const { app, fetchJson } = setup();
    expect((await app.request("/healthz")).status).toBe(200);
    expect((await fetchJson("/commands", { auth: false })).status).toBe(401);
    expect(
      (
        await app.request("/commands", {
          headers: { Authorization: "Bearer wrong" },
        })
      ).status,
    ).toBe(401);
    expect((await fetchJson("/commands")).status).toBe(200);
  });

  it("POST /runs validates the payload and accepts a valid request", async () => {
    const { fetchJson } = setup();
    const bad = await fetchJson("/runs", {
      method: "POST",
      body: JSON.stringify({ runId: "x" }),
    });
    expect(bad.status).toBe(400);

    const accepted = await fetchJson("/runs", {
      method: "POST",
      body: JSON.stringify(RUN_BODY),
    });
    expect(accepted.status).toBe(202);
    expect(await accepted.json()).toMatchObject({ ok: true, runId: "run1" });

    // Idempotent retry.
    const retried = await fetchJson("/runs", {
      method: "POST",
      body: JSON.stringify(RUN_BODY),
    });
    expect(retried.status).toBe(202);
    expect(await retried.json()).toMatchObject({ deduplicated: true });
  });

  it("POST /runs executes a Convex-pre-created queued run instead of deduping", async () => {
    // The v2 startThread mutation inserts the run row as `queued` BEFORE
    // dispatching; the service must treat that as "not yet accepted".
    const { store, fetchJson } = setup();
    await store.upsertThread({ threadId: "t1", ownerUserId: "u1", agentKind: "lite" });
    await store.createRun({
      runId: "run-preseeded",
      threadId: "t1",
      ownerUserId: "u1",
      agentKind: "lite",
      mode: "normal",
      promptMessageId: "m-user",
    });
    const accepted = await fetchJson("/runs", {
      method: "POST",
      body: JSON.stringify({ ...RUN_BODY, runId: "run-preseeded" }),
    });
    expect(accepted.status).toBe(202);
    const body = (await accepted.json()) as { deduplicated?: boolean };
    expect(body.deduplicated).toBeUndefined();
  });

  it("POST /interactions/:id/respond records the response", async () => {
    const { store, fetchJson } = setup();
    const interaction = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run9",
      type: "tool_approval",
      toolName: "proposeArtifact",
      payload: {},
    });
    const response = await fetchJson(`/interactions/${interaction.id}/respond`, {
      method: "POST",
      body: JSON.stringify({ kind: "approval", approved: true }),
    });
    expect(response.status).toBe(200);
    const stored = await store.getInteraction(interaction.id);
    expect(stored?.status).toBe("responded");

    // Responding twice conflicts.
    const again = await fetchJson(`/interactions/${interaction.id}/respond`, {
      method: "POST",
      body: JSON.stringify({ kind: "approval", approved: false }),
    });
    expect(again.status).toBe(409);
  });

  it("rejects malformed interaction responses", async () => {
    const { store, fetchJson } = setup();
    const interaction = await store.createInteraction({
      ownerUserId: "u1",
      threadId: "t1",
      runId: "run9",
      type: "ask_user",
      toolName: "askUser",
      payload: {},
    });
    const response = await fetchJson(`/interactions/${interaction.id}/respond`, {
      method: "POST",
      body: JSON.stringify({ kind: "nonsense" }),
    });
    expect(response.status).toBe(400);
  });

  it("GET /commands lists /deep plus the skills", async () => {
    const { fetchJson } = setup();
    const response = await fetchJson("/commands");
    const commands = (await response.json()) as Array<{ name: string; scope: string }>;
    expect(commands.find((c) => c.name === "deep")?.scope).toBe("service");
    expect(commands.some((c) => c.name === "verify-citations")).toBe(true);
    expect(commands.length).toBeGreaterThanOrEqual(11);
  });

  it("POST /runs/:id/cancel cancels a finished-unknown run gracefully", async () => {
    const { fetchJson } = setup();
    const missing = await fetchJson("/runs/none/cancel", { method: "POST" });
    expect(missing.status).toBe(404);
  });
});
