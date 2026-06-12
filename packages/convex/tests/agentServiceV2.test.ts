/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

// Step 1 (plan §9.4): the agent/service:* facade is the Convex side of
// SERVICE_FUNCTIONS in apps/agents/src/store/convexStore.ts. These tests pin
// the contract: token gating, record shapes, idempotency, interaction
// lifecycle, and the watchdog sweep.

const modules = import.meta.glob("../convex/**/*.ts");
const TOKEN = "test-service-token";
const OWNER = "owner-v2";
const THREAD = "thr_test-1";
const RUN = "run_test-1";

function setup() {
  vi.stubEnv("AGENTS_SERVICE_TOKEN", TOKEN);
  return convexTest(schema, modules);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

async function seedThread(t: ReturnType<typeof convexTest>) {
  return await t.mutation(api.agent.service.upsertThread, {
    serviceToken: TOKEN,
    threadId: THREAD,
    ownerUserId: OWNER,
    agentKind: "lite",
  });
}

describe("agent/service auth boundary", () => {
  it("rejects calls without a valid service token", async () => {
    const t = setup();
    await expect(
      t.query(api.agent.service.getThread, {
        serviceToken: "wrong",
        threadId: THREAD,
      }),
    ).rejects.toThrow(/Invalid service token/);
  });

  it("rejects everything when the env token is unset", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("AGENTS_SERVICE_TOKEN", "");
    await expect(
      t.query(api.agent.service.getThread, {
        serviceToken: "",
        threadId: THREAD,
      }),
    ).rejects.toThrow(/Invalid service token/);
  });
});

describe("threads + messages", () => {
  it("upserts idempotently and maps the thread record", async () => {
    const t = setup();
    const created = await seedThread(t);
    expect(created).toMatchObject({
      threadId: THREAD,
      ownerUserId: OWNER,
      agentKind: "lite",
      status: "idle",
      messageCount: 0,
    });
    const again = await seedThread(t);
    expect(again.threadId).toBe(THREAD);

    await t.mutation(api.agent.service.setThreadSession, {
      serviceToken: TOKEN,
      threadId: THREAD,
      sdkSessionId: "sess-1",
    });
    await t.mutation(api.agent.service.setThreadStatus, {
      serviceToken: TOKEN,
      threadId: THREAD,
      status: "streaming",
    });
    const fetched = await t.query(api.agent.service.getThread, {
      serviceToken: TOKEN,
      threadId: THREAD,
    });
    expect(fetched).toMatchObject({ sdkSessionId: "sess-1", status: "streaming" });
  });

  it("refuses to re-bind a thread to another owner", async () => {
    const t = setup();
    await seedThread(t);
    await expect(
      t.mutation(api.agent.service.upsertThread, {
        serviceToken: TOKEN,
        threadId: THREAD,
        ownerUserId: "intruder",
        agentKind: "lite",
      }),
    ).rejects.toThrow(/another user/);
  });

  it("creates, streams, finalizes, and lists messages chronologically", async () => {
    const t = setup();
    await seedThread(t);
    const user = await t.mutation(api.agent.service.createMessage, {
      serviceToken: TOKEN,
      threadId: THREAD,
      ownerUserId: OWNER,
      role: "user",
      text: "hai",
      status: "complete",
    });
    const assistant = await t.mutation(api.agent.service.createMessage, {
      serviceToken: TOKEN,
      threadId: THREAD,
      ownerUserId: OWNER,
      role: "assistant",
      text: "",
      runId: RUN,
      status: "streaming",
    });
    await t.mutation(api.agent.service.updateMessageText, {
      serviceToken: TOKEN,
      messageId: assistant.messageId,
      text: "sedang menulis…",
    });
    await t.mutation(api.agent.service.finalizeMessage, {
      serviceToken: TOKEN,
      messageId: assistant.messageId,
      text: "selesai.",
      status: "complete",
    });
    const listed = await t.query(api.agent.service.listMessages, {
      serviceToken: TOKEN,
      threadId: THREAD,
      limit: 10,
    });
    expect(listed.map((m: { role: string }) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(listed[1]).toMatchObject({ text: "selesai.", status: "complete" });
    expect(user.messageId).not.toBe(assistant.messageId);

    const thread = await t.query(api.agent.service.getThread, {
      serviceToken: TOKEN,
      threadId: THREAD,
    });
    expect(thread?.messageCount).toBe(2);
  });
});

describe("runs + events", () => {
  it("creates idempotently, finalizes with usage, and heartbeats via events", async () => {
    const t = setup();
    await seedThread(t);
    const run = await t.mutation(api.agent.service.createRun, {
      serviceToken: TOKEN,
      runId: RUN,
      threadId: THREAD,
      ownerUserId: OWNER,
      agentKind: "pro",
      mode: "normal",
    });
    expect(run).toMatchObject({ runId: RUN, status: "queued" });
    const dup = await t.mutation(api.agent.service.createRun, {
      serviceToken: TOKEN,
      runId: RUN,
      threadId: THREAD,
      ownerUserId: OWNER,
      agentKind: "pro",
      mode: "normal",
    });
    expect(dup.runId).toBe(RUN);

    await t.mutation(api.agent.service.setRunStatus, {
      serviceToken: TOKEN,
      runId: RUN,
      status: "running",
    });
    const first = await t.mutation(api.agent.service.appendRunEvent, {
      serviceToken: TOKEN,
      runId: RUN,
      type: "tool_start",
      payloadJson: JSON.stringify({ tool: "searchWeb" }),
    });
    const second = await t.mutation(api.agent.service.appendRunEvent, {
      serviceToken: TOKEN,
      runId: RUN,
      type: "tool_end",
      payloadJson: "{}",
    });
    expect([first.seq, second.seq]).toEqual([0, 1]);

    await t.mutation(api.agent.service.finalizeRun, {
      serviceToken: TOKEN,
      runId: RUN,
      status: "completed",
      sdkSessionId: "sess-9",
      costUsd: 0.12,
      usage: { inputTokens: 10, outputTokens: 20 },
      numTurns: 2,
    });
    const fetched = await t.query(api.agent.service.getRun, {
      serviceToken: TOKEN,
      runId: RUN,
    });
    expect(fetched).toMatchObject({
      status: "completed",
      sdkSessionId: "sess-9",
      costUsd: 0.12,
      numTurns: 2,
    });
    expect(JSON.parse(fetched!.usageJson!)).toEqual({
      inputTokens: 10,
      outputTokens: 20,
    });
    const events = await t.query(api.agent.service.listRunEvents, {
      serviceToken: TOKEN,
      runId: RUN,
    });
    expect(events.map((e: { type: string }) => e.type)).toEqual([
      "tool_start",
      "tool_end",
    ]);
  });
});

describe("interactions (HITL)", () => {
  async function seedInteraction(t: ReturnType<typeof convexTest>) {
    await seedThread(t);
    return await t.mutation(api.agent.service.createInteraction, {
      serviceToken: TOKEN,
      ownerUserId: OWNER,
      threadId: THREAD,
      runId: RUN,
      type: "tool_approval",
      toolName: "createWorkspace",
      payloadJson: JSON.stringify({ name: "Riset" }),
    });
  }

  it("round-trips payload/response JSON and responds exactly once", async () => {
    const t = setup();
    const interaction = await seedInteraction(t);
    expect(interaction).toMatchObject({
      status: "pending",
      toolName: "createWorkspace",
      payload: { name: "Riset" },
    });

    const responded = await t.mutation(api.agent.service.respondInteraction, {
      serviceToken: TOKEN,
      interactionId: interaction.id,
      responseJson: JSON.stringify({ kind: "approval", approved: true }),
    });
    expect(responded).toMatchObject({
      status: "responded",
      response: { kind: "approval", approved: true },
    });

    const again = await t.mutation(api.agent.service.respondInteraction, {
      serviceToken: TOKEN,
      interactionId: interaction.id,
      responseJson: JSON.stringify({ kind: "approval", approved: false }),
    });
    expect(again).toBeNull();
  });

  it("expires only pending rows and lists by thread", async () => {
    const t = setup();
    const interaction = await seedInteraction(t);
    await t.mutation(api.agent.service.expireInteraction, {
      serviceToken: TOKEN,
      interactionId: interaction.id,
    });
    const listed = await t.query(api.agent.service.listInteractions, {
      serviceToken: TOKEN,
      threadId: THREAD,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ status: "expired" });
  });
});

describe("workspace + artifact actions", () => {
  it("creates and renames a workspace through the agent internals", async () => {
    const t = setup();
    const created = await t.mutation(api.agent.service.applyWorkspaceAction, {
      serviceToken: TOKEN,
      ownerUserId: OWNER,
      action: "create",
      name: "Spike Workspace",
    });
    expect(created.ok).toBe(true);
    const renamed = await t.mutation(api.agent.service.applyWorkspaceAction, {
      serviceToken: TOKEN,
      ownerUserId: OWNER,
      action: "rename",
      workspaceId: created.workspaceId,
      name: "Riset Gamifikasi",
    });
    expect(renamed).toMatchObject({ ok: true, workspaceId: created.workspaceId });
  });

  it("creates into the default workspace, updates, and soft-deletes artifacts", async () => {
    const t = setup();
    await seedThread(t);
    const created = await t.mutation(api.agent.service.applyArtifactAction, {
      serviceToken: TOKEN,
      ownerUserId: OWNER,
      threadId: THREAD,
      action: "create",
      title: "Draf laporan",
      artifactType: "markdown",
      content: "# Halo\n\nIsi laporan.",
    });
    expect(created.ok).toBe(true);
    expect(created.artifactId).toBeDefined();

    const snapshot = await t.query(api.agent.service.getArtifact, {
      serviceToken: TOKEN,
      artifactId: created.artifactId!,
    });
    expect(snapshot).toMatchObject({ title: "Draf laporan" });
    expect(snapshot!.text).toContain("Isi laporan");

    const updated = await t.mutation(api.agent.service.applyArtifactAction, {
      serviceToken: TOKEN,
      ownerUserId: OWNER,
      threadId: THREAD,
      action: "update",
      artifactId: created.artifactId,
      title: "Draf laporan v2",
      artifactType: "markdown",
      content: "# Versi 2",
    });
    expect(updated.ok).toBe(true);

    const listed = await t.query(api.agent.service.listContextArtifacts, {
      serviceToken: TOKEN,
      threadId: THREAD,
      artifactIds: [created.artifactId!],
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ title: "Draf laporan v2" });

    const deleted = await t.mutation(api.agent.service.applyArtifactAction, {
      serviceToken: TOKEN,
      ownerUserId: OWNER,
      threadId: THREAD,
      action: "delete",
      artifactId: created.artifactId,
    });
    expect(deleted.ok).toBe(true);
    const afterDelete = await t.query(api.agent.service.getArtifact, {
      serviceToken: TOKEN,
      artifactId: created.artifactId!,
    });
    expect(afterDelete).toBeNull();
  });

  it("returns reasons instead of throwing on bad input", async () => {
    const t = setup();
    await seedThread(t);
    const result = await t.mutation(api.agent.service.applyArtifactAction, {
      serviceToken: TOKEN,
      ownerUserId: OWNER,
      threadId: THREAD,
      action: "delete",
      artifactId: "not-a-real-id",
    });
    expect(result).toMatchObject({ ok: false });
  });
});

describe("getWorkspaceManifests", () => {
  it("returns only owned workspaces with their active items", async () => {
    const t = setup();
    await seedThread(t);
    const ws = await t.mutation(api.agent.service.applyWorkspaceAction, {
      serviceToken: TOKEN,
      ownerUserId: OWNER,
      action: "create",
      name: "Manifest WS",
    });
    await t.mutation(api.agent.service.applyArtifactAction, {
      serviceToken: TOKEN,
      ownerUserId: OWNER,
      threadId: THREAD,
      action: "create",
      workspaceId: ws.workspaceId,
      title: "Item A",
      artifactType: "markdown",
      content: "isi",
    });
    const manifests = await t.query(api.agent.service.getWorkspaceManifests, {
      serviceToken: TOKEN,
      ownerUserId: OWNER,
      workspaceIds: [ws.workspaceId!],
    });
    expect(manifests).toHaveLength(1);
    expect(manifests[0]).toMatchObject({ name: "Manifest WS" });
    expect(manifests[0]!.items.map((i: { title: string }) => i.title)).toEqual([
      "Item A",
    ]);

    const foreign = await t.query(api.agent.service.getWorkspaceManifests, {
      serviceToken: TOKEN,
      ownerUserId: "someone-else",
      workspaceIds: [ws.workspaceId!],
    });
    expect(foreign).toHaveLength(0);
  });
});

describe("agent.v2.interactions.respond (public)", () => {
  const IDENTITY = { tokenIdentifier: OWNER, subject: OWNER };

  async function seedRespondFixture(t: ReturnType<typeof convexTest>) {
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        ownerUserId: OWNER,
        clerkUserId: OWNER,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("users", {
        ownerUserId: "intruder",
        clerkUserId: "intruder",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("chatThreads", {
        threadId: THREAD,
        ownerUserId: OWNER,
        agentKind: "lite",
        status: "idle",
        lastActivityAt: now,
        messageCount: 0,
      });
      await ctx.db.insert("agentRuns2", {
        runId: RUN,
        threadId: THREAD,
        ownerUserId: OWNER,
        agentKind: "lite",
        mode: "normal",
        status: "running",
        createdAt: now,
        updatedAt: now,
      });
    });
    return await t.run(async (ctx) => {
      return await ctx.db.insert("pendingInteractions", {
        ownerUserId: OWNER,
        threadId: THREAD,
        runId: RUN,
        type: "tool_approval",
        toolName: "proposeArtifact",
        payloadJson: "{}",
        status: "pending",
        createdAt: Date.now(),
      });
    });
  }

  it("records the response in place while the run is inside its hold-window", async () => {
    const t = setup();
    const interactionId = await seedRespondFixture(t);
    const result = await t
      .withIdentity(IDENTITY)
      .mutation(api.agent.v2.interactions.respond, {
        interactionId,
        response: { kind: "approval", approved: true },
      });
    // Run status is `running` → no resume forwarding needed.
    expect(result).toEqual({ ok: true, resuming: false });
    const row = await t.run(async (ctx) => ctx.db.get("pendingInteractions", interactionId));
    expect(row).toMatchObject({ status: "responded" });
  });

  it("flags resuming for an interrupted run and rejects foreign users", async () => {
    const t = setup();
    const interactionId = await seedRespondFixture(t);
    await t.run(async (ctx) => {
      const run = await ctx.db
        .query("agentRuns2")
        .withIndex("by_run_id", (q) => q.eq("runId", RUN))
        .unique();
      await ctx.db.patch("agentRuns2", run!._id, { status: "waiting_hitl" });
    });

    await expect(
      t
        .withIdentity({ tokenIdentifier: "intruder", subject: "intruder" })
        .mutation(api.agent.v2.interactions.respond, {
          interactionId,
          response: { kind: "approval", approved: true },
        }),
    ).rejects.toThrow(/Interaction not found/);

    const result = await t
      .withIdentity(IDENTITY)
      .mutation(api.agent.v2.interactions.respond, {
        interactionId,
        response: { kind: "approval", approved: true },
      });
    expect(result).toEqual({ ok: true, resuming: true });

    await expect(
      t.withIdentity(IDENTITY).mutation(api.agent.v2.interactions.respond, {
        interactionId,
        response: { kind: "approval", approved: false },
      }),
    ).rejects.toThrow(/already been handled/);
  });

  it("rejects a response kind that does not match the interaction type", async () => {
    const t = setup();
    const interactionId = await seedRespondFixture(t);
    await expect(
      t.withIdentity(IDENTITY).mutation(api.agent.v2.interactions.respond, {
        interactionId,
        response: { kind: "answers", answers: [{ prompt: "x" }] },
      }),
    ).rejects.toThrow(/expects an approval/);
  });
});

describe("watchdogSweep", () => {
  it("fails stalled queued/running runs but never waiting_hitl", async () => {
    const t = setup();
    const past = Date.now() - 30 * 60 * 1000;
    await t.run(async (ctx) => {
      await ctx.db.insert("chatThreads", {
        threadId: THREAD,
        ownerUserId: OWNER,
        agentKind: "lite",
        status: "streaming",
        lastActivityAt: past,
        messageCount: 0,
      });
      for (const [runId, status] of [
        ["run_stalled-queued", "queued"],
        ["run_stalled-running", "running"],
        ["run_waiting-user", "waiting_hitl"],
      ] as const) {
        await ctx.db.insert("agentRuns2", {
          runId,
          threadId: THREAD,
          ownerUserId: OWNER,
          agentKind: "lite",
          mode: "normal",
          status,
          createdAt: past,
          updatedAt: past,
        });
      }
    });
    await t.mutation(internal.agent.v2.watchdogSweep, {});
    const statuses = await t.run(async (ctx) => {
      const runs = await ctx.db.query("agentRuns2").collect();
      return Object.fromEntries(runs.map((run) => [run.runId, run.status]));
    });
    expect(statuses).toEqual({
      "run_stalled-queued": "failed",
      "run_stalled-running": "failed",
      "run_waiting-user": "waiting_hitl",
    });
  });
});
