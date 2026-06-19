/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { deleteAgentData } from "../convex/accountCleanup/agent";
import { cleanupOwnerArtifacts } from "../convex/accountCleanup/artifacts";

// Step 1 (plan §9.4): the agent/service:* facade is the Convex side of
// SERVICE_FUNCTIONS in apps/agents/src/store/convexStore.ts. These tests pin
// the contract: token gating, record shapes, idempotency, interaction
// lifecycle, and the watchdog sweep.

const modules = import.meta.glob("../convex/**/*.ts");
const TOKEN = "test-service-token";
const OWNER = "owner-agent";
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

  it("lists only pending interactions for a run (replay idempotency)", async () => {
    const t = setup();
    await seedThread(t);
    const plan = await t.mutation(api.agent.service.createInteraction, {
      serviceToken: TOKEN,
      ownerUserId: OWNER,
      threadId: THREAD,
      runId: RUN,
      type: "tool_approval",
      toolName: "proposeResearchPlan",
      payloadJson: JSON.stringify({ title: "Rencana", questions: ["a", "b", "c"] }),
    });
    // A second, already-responded interaction on the same run must be excluded.
    const other = await t.mutation(api.agent.service.createInteraction, {
      serviceToken: TOKEN,
      ownerUserId: OWNER,
      threadId: THREAD,
      runId: RUN,
      type: "tool_approval",
      toolName: "createWorkspace",
      payloadJson: "{}",
    });
    await t.mutation(api.agent.service.respondInteraction, {
      serviceToken: TOKEN,
      interactionId: other.id,
      responseJson: JSON.stringify({ kind: "approval", approved: true }),
    });

    const pending = await t.query(
      api.agent.service.listPendingInteractionsByRun,
      { serviceToken: TOKEN, runId: RUN },
    );
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      id: plan.id,
      status: "pending",
      toolName: "proposeResearchPlan",
    });
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

describe("agent.interactions.respond (public)", () => {
  const IDENTITY = { tokenIdentifier: OWNER, subject: OWNER };

  async function seedRespondFixture(
    t: ReturnType<typeof convexTest>,
    options?: {
      type?: "ask_user" | "tool_approval";
      toolName?: string;
      payloadJson?: string;
    },
  ) {
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
      await ctx.db.insert("agentRuns", {
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
        type: options?.type ?? "tool_approval",
        toolName: options?.toolName ?? "proposeArtifact",
        payloadJson: options?.payloadJson ?? "{}",
        status: "pending",
        createdAt: Date.now(),
      });
    });
  }

  it("records the response and materializes the answer as a user message", async () => {
    const t = setup();
    const interactionId = await seedRespondFixture(t);
    const result = await t
      .withIdentity(IDENTITY)
      .mutation(api.agent.interactions.respond, {
        interactionId,
        response: { kind: "approval", approved: true },
      });
    // Run status is `running` → no resume forwarding needed.
    expect(result).toEqual({ ok: true, resuming: false });
    const row = await t.run(async (ctx) => ctx.db.get("pendingInteractions", interactionId));
    expect(row).toMatchObject({ status: "responded" });

    // The answer is materialized as a real user message (folded into the run's
    // turn on the client) and the thread message count is bumped.
    const messages = await t.run(async (ctx) =>
      ctx.db
        .query("chatMessages")
        .withIndex("by_thread_created", (q) => q.eq("threadId", THREAD))
        .collect(),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: "user",
      text: "Setujui",
      runId: RUN,
    });
    const thread = await t.run(async (ctx) =>
      ctx.db
        .query("chatThreads")
        .withIndex("by_thread_id", (q) => q.eq("threadId", THREAD))
        .unique(),
    );
    expect(thread?.messageCount).toBe(1);
  });

  it("flags resuming for an interrupted run and rejects foreign users", async () => {
    const t = setup();
    const interactionId = await seedRespondFixture(t);
    await t.run(async (ctx) => {
      const run = await ctx.db
        .query("agentRuns")
        .withIndex("by_run_id", (q) => q.eq("runId", RUN))
        .unique();
      await ctx.db.patch("agentRuns", run!._id, { status: "waiting_hitl" });
    });

    await expect(
      t
        .withIdentity({ tokenIdentifier: "intruder", subject: "intruder" })
        .mutation(api.agent.interactions.respond, {
          interactionId,
          response: { kind: "approval", approved: true },
        }),
    ).rejects.toThrow(/Interaction not found/);

    const result = await t
      .withIdentity(IDENTITY)
      .mutation(api.agent.interactions.respond, {
        interactionId,
        response: { kind: "approval", approved: true },
      });
    expect(result).toEqual({ ok: true, resuming: true });

    await expect(
      t.withIdentity(IDENTITY).mutation(api.agent.interactions.respond, {
        interactionId,
        response: { kind: "approval", approved: false },
      }),
    ).rejects.toThrow(/already been handled/);
  });

  it("rejects a response kind that does not match the interaction type", async () => {
    const t = setup();
    const interactionId = await seedRespondFixture(t);
    await expect(
      t.withIdentity(IDENTITY).mutation(api.agent.interactions.respond, {
        interactionId,
        response: { kind: "answers", answers: [{ prompt: "x" }] },
      }),
    ).rejects.toThrow(/expects an approval/);
  });

  // Deep-research plan gate (plan §5.2): the guard routes on toolName, so the
  // proposeResearchPlan card accepts ONLY plan_decision while every other
  // tool_approval card still accepts ONLY approval.
  it("accepts the three plan_decision variants for proposeResearchPlan", async () => {
    for (const decision of ["start", "revise", "reject"] as const) {
      const t = setup();
      const interactionId = await seedRespondFixture(t, {
        toolName: "proposeResearchPlan",
      });
      await t.run(async (ctx) => {
        const run = await ctx.db
          .query("agentRuns")
          .withIndex("by_run_id", (q) => q.eq("runId", RUN))
          .unique();
        await ctx.db.patch("agentRuns", run!._id, { status: "waiting_hitl" });
      });
      const result = await t
        .withIdentity(IDENTITY)
        .mutation(api.agent.interactions.respond, {
          interactionId,
          response: { kind: "plan_decision", decision },
        });
      expect(result).toEqual({ ok: true, resuming: true });
      const row = await t.run(async (ctx) =>
        ctx.db.get("pendingInteractions", interactionId),
      );
      expect(row).toMatchObject({ status: "responded" });
    }
  });

  it("rejects plan_decision on a non-plan tool_approval card", async () => {
    const t = setup();
    const interactionId = await seedRespondFixture(t, {
      toolName: "proposeArtifact",
    });
    await expect(
      t.withIdentity(IDENTITY).mutation(api.agent.interactions.respond, {
        interactionId,
        response: { kind: "plan_decision", decision: "start" },
      }),
    ).rejects.toThrow(/expects an approval/);
  });

  it("rejects a plain approval on the proposeResearchPlan card", async () => {
    const t = setup();
    const interactionId = await seedRespondFixture(t, {
      toolName: "proposeResearchPlan",
    });
    await expect(
      t.withIdentity(IDENTITY).mutation(api.agent.interactions.respond, {
        interactionId,
        response: { kind: "approval", approved: true },
      }),
    ).rejects.toThrow(/expects a research-plan decision/);
  });

  it("rejects plan_decision on an ask_user interaction", async () => {
    const t = setup();
    const interactionId = await seedRespondFixture(t, {
      type: "ask_user",
      toolName: "askUser",
    });
    await expect(
      t.withIdentity(IDENTITY).mutation(api.agent.interactions.respond, {
        interactionId,
        response: { kind: "plan_decision", decision: "start" },
      }),
    ).rejects.toThrow(/expects answers/);
  });
});

describe("durable cancel (Step 3)", () => {
  const IDENTITY = { tokenIdentifier: OWNER, subject: OWNER };

  async function seedCancelFixture(t: ReturnType<typeof convexTest>) {
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        ownerUserId: OWNER,
        clerkUserId: OWNER,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("chatThreads", {
        threadId: THREAD,
        ownerUserId: OWNER,
        agentKind: "lite",
        status: "streaming",
        lastActivityAt: now,
        messageCount: 1,
      });
      await ctx.db.insert("agentRuns", {
        runId: RUN,
        threadId: THREAD,
        ownerUserId: OWNER,
        agentKind: "lite",
        mode: "normal",
        status: "running",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("chatMessages", {
        threadId: THREAD,
        ownerUserId: OWNER,
        role: "assistant",
        text: "sedang menulis…",
        runId: RUN,
        status: "streaming",
        createdAt: now,
      });
    });
  }

  it("flips run→canceled + thread→idle in Convex before forwarding", async () => {
    const t = setup();
    await seedCancelFixture(t);
    const result = await t
      .withIdentity(IDENTITY)
      .mutation(api.agent.cancelRun, { runId: RUN });
    expect(result).toEqual({ ok: true });
    const state = await t.run(async (ctx) => {
      const run = await ctx.db
        .query("agentRuns")
        .withIndex("by_run_id", (q) => q.eq("runId", RUN))
        .unique();
      const thread = await ctx.db
        .query("chatThreads")
        .withIndex("by_thread_id", (q) => q.eq("threadId", THREAD))
        .unique();
      const message = await ctx.db
        .query("chatMessages")
        .withIndex("by_thread_created", (q) => q.eq("threadId", THREAD))
        .unique();
      return {
        run: run!.status,
        thread: thread!.status,
        message: message!.status,
      };
    });
    expect(state).toEqual({ run: "canceled", thread: "idle", message: "complete" });
  });

  it("keeps canceled sticky against late service finalize/setRunStatus", async () => {
    const t = setup();
    await seedCancelFixture(t);
    await t.withIdentity(IDENTITY).mutation(api.agent.cancelRun, { runId: RUN });

    await t.mutation(api.agent.service.setRunStatus, {
      serviceToken: TOKEN,
      runId: RUN,
      status: "running",
    });
    await t.mutation(api.agent.service.finalizeRun, {
      serviceToken: TOKEN,
      runId: RUN,
      status: "completed",
      sdkSessionId: "sess-late",
      costUsd: 0.05,
      errorMessage: "should not stick",
    });
    const run = await t.query(api.agent.service.getRun, {
      serviceToken: TOKEN,
      runId: RUN,
    });
    // Status stays canceled; bookkeeping (cost/session) is still recorded.
    expect(run).toMatchObject({
      status: "canceled",
      sdkSessionId: "sess-late",
      costUsd: 0.05,
    });
    expect(run!.errorMessage).toBeUndefined();
  });
});

describe("setRunVerificationReport (Step 5)", () => {
  it("persists the report JSON on the run", async () => {
    const t = setup();
    await seedThread(t);
    await t.mutation(api.agent.service.createRun, {
      serviceToken: TOKEN,
      runId: RUN,
      threadId: THREAD,
      ownerUserId: OWNER,
      agentKind: "lite",
      mode: "normal",
    });
    await t.mutation(api.agent.service.setRunVerificationReport, {
      serviceToken: TOKEN,
      runId: RUN,
      verificationReportJson: JSON.stringify({ verdict: "passed" }),
    });
    const run = await t.query(api.agent.service.getRun, {
      serviceToken: TOKEN,
      runId: RUN,
    });
    expect(JSON.parse(run!.verificationReportJson!)).toEqual({ verdict: "passed" });
  });
});

describe("research phase state (Step 4)", () => {
  it("upserts phases idempotently and lists them per run", async () => {
    const t = setup();
    const created = await t.mutation(api.agent.service.upsertResearchPhase, {
      serviceToken: TOKEN,
      runId: RUN,
      phase: "plan",
      status: "running",
    });
    expect(created).toMatchObject({ runId: RUN, phase: "plan", status: "running" });

    const done = await t.mutation(api.agent.service.upsertResearchPhase, {
      serviceToken: TOKEN,
      runId: RUN,
      phase: "plan",
      status: "done",
      output: "rencana riset",
      sdkSessionId: "sess-plan",
      costUsd: 0.2,
    });
    expect(done).toMatchObject({
      status: "done",
      output: "rencana riset",
      sdkSessionId: "sess-plan",
      costUsd: 0.2,
    });

    // Partial update keeps earlier fields.
    const touched = await t.mutation(api.agent.service.upsertResearchPhase, {
      serviceToken: TOKEN,
      runId: RUN,
      phase: "plan",
      status: "done",
    });
    expect(touched.output).toBe("rencana riset");

    await t.mutation(api.agent.service.upsertResearchPhase, {
      serviceToken: TOKEN,
      runId: RUN,
      phase: "literature",
      status: "running",
    });
    const listed = await t.query(api.agent.service.listResearchPhases, {
      serviceToken: TOKEN,
      runId: RUN,
    });
    expect(listed).toHaveLength(2);
    expect(listed.map((p: { phase: string }) => p.phase).sort()).toEqual([
      "literature",
      "plan",
    ]);

    await expect(
      t.query(api.agent.service.listResearchPhases, {
        serviceToken: "wrong",
        runId: RUN,
      }),
    ).rejects.toThrow(/Invalid service token/);
  });
});

describe("retryRun (Step 3)", () => {
  const IDENTITY = { tokenIdentifier: OWNER, subject: OWNER };

  async function seedFailedRun(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        ownerUserId: OWNER,
        clerkUserId: OWNER,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("chatThreads", {
        threadId: THREAD,
        ownerUserId: OWNER,
        agentKind: "lite",
        status: "failed",
        lastActivityAt: now,
        messageCount: 1,
      });
      const promptId = await ctx.db.insert("chatMessages", {
        threadId: THREAD,
        ownerUserId: OWNER,
        role: "user",
        text: "tolong ringkas papernya",
        runId: RUN,
        status: "complete",
        createdAt: now,
      });
      await ctx.db.insert("agentRuns", {
        runId: RUN,
        threadId: THREAD,
        ownerUserId: OWNER,
        agentKind: "lite",
        mode: "normal",
        promptMessageId: String(promptId),
        status: "failed",
        errorMessage: "Agent service unreachable",
        createdAt: now,
        updatedAt: now,
      });
      return promptId;
    });
  }

  it("re-queues a failed run and schedules a fresh dispatch", async () => {
    const t = setup();
    await seedFailedRun(t);
    const result = await t
      .withIdentity(IDENTITY)
      .mutation(api.agent.retryRun, { runId: RUN });
    expect(result).toEqual({ ok: true });
    const state = await t.run(async (ctx) => {
      const run = await ctx.db
        .query("agentRuns")
        .withIndex("by_run_id", (q) => q.eq("runId", RUN))
        .unique();
      const thread = await ctx.db
        .query("chatThreads")
        .withIndex("by_thread_id", (q) => q.eq("threadId", THREAD))
        .unique();
      const jobs = await ctx.db.system.query("_scheduled_functions").collect();
      return {
        status: run!.status,
        errorMessage: run!.errorMessage,
        thread: thread!.status,
        dispatches: jobs.filter((job) => job.name.includes("dispatchRun")).length,
      };
    });
    expect(state).toEqual({
      status: "queued",
      errorMessage: undefined,
      thread: "idle",
      dispatches: 1,
    });
  });

  it("rejects retry for non-failed runs", async () => {
    const t = setup();
    await seedFailedRun(t);
    await t.run(async (ctx) => {
      const run = await ctx.db
        .query("agentRuns")
        .withIndex("by_run_id", (q) => q.eq("runId", RUN))
        .unique();
      await ctx.db.patch("agentRuns", run!._id, { status: "completed" });
    });
    await expect(
      t.withIdentity(IDENTITY).mutation(api.agent.retryRun, { runId: RUN }),
    ).rejects.toThrow(/Only failed runs/);
  });
});

describe("artifact↔thread link + listArtifacts (Step 3)", () => {
  const IDENTITY = { tokenIdentifier: OWNER, subject: OWNER };

  it("links service-created artifacts to the thread and lists them publicly", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        ownerUserId: OWNER,
        clerkUserId: OWNER,
        createdAt: now,
        updatedAt: now,
      });
    });
    await seedThread(t);
    const created = await t.mutation(api.agent.service.applyArtifactAction, {
      serviceToken: TOKEN,
      ownerUserId: OWNER,
      threadId: THREAD,
      action: "create",
      title: "Laporan tertaut",
      artifactType: "markdown",
      content: "# Isi",
    });
    expect(created.ok).toBe(true);

    const row = await t.run(async (ctx) => {
      const id = ctx.db.normalizeId("artifacts", created.artifactId!);
      return await ctx.db.get("artifacts", id!);
    });
    expect(row!.threadId).toBe(THREAD);

    const listed = await t
      .withIdentity(IDENTITY)
      .query(api.agent.queries.listArtifacts, { threadId: THREAD });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ title: "Laporan tertaut" });
    // Agent-created artifacts are now born HEADLESS (no workspace) — they only
    // get one when the user links them from the chat artifact card. The thread
    // link still holds (asserted above), but workspaceId is undefined until then.
    expect(listed[0]!.workspaceId).toBeUndefined();
    // Fase 5 cleanup: the dead `currentVersionId` projection is gone.
    expect(listed[0]).not.toHaveProperty("currentVersionId");

    const foreign = await t
      .withIdentity({ tokenIdentifier: "intruder", subject: "intruder" })
      .query(api.agent.queries.listArtifacts, { threadId: THREAD });
    expect(foreign).toEqual([]);
  });

  it("cleans up an owner's artifacts + contents without the dead artifactVersions table (Fase 5)", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        ownerUserId: OWNER,
        clerkUserId: OWNER,
        createdAt: now,
        updatedAt: now,
      });
    });
    await seedThread(t);
    await t.mutation(api.agent.service.applyArtifactAction, {
      serviceToken: TOKEN,
      ownerUserId: OWNER,
      threadId: THREAD,
      action: "create",
      title: "Untuk dihapus",
      artifactType: "markdown",
      content: "# Isi",
    });

    const result = await t.run(async (ctx) =>
      cleanupOwnerArtifacts(ctx, OWNER, new Set<Id<"_storage">>()),
    );
    expect(result.deletedRows).toBeGreaterThan(0);

    const remaining = await t.run(async (ctx) =>
      ctx.db
        .query("artifacts")
        .withIndex("by_owner_status_updated", (q) => q.eq("ownerUserId", OWNER))
        .take(10),
    );
    expect(remaining).toHaveLength(0);
  });
});

describe("watchdog resume-recovery (Step 3)", () => {
  async function seedWaitingRun(
    t: ReturnType<typeof convexTest>,
    input: { runUpdatedAt: number; respondedAt?: number; pending?: boolean },
  ) {
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("chatThreads", {
        threadId: THREAD,
        ownerUserId: OWNER,
        agentKind: "lite",
        status: "idle",
        lastActivityAt: now,
        messageCount: 0,
      });
      await ctx.db.insert("agentRuns", {
        runId: RUN,
        threadId: THREAD,
        ownerUserId: OWNER,
        agentKind: "lite",
        mode: "normal",
        status: "waiting_hitl",
        createdAt: input.runUpdatedAt,
        updatedAt: input.runUpdatedAt,
      });
      await ctx.db.insert("pendingInteractions", {
        ownerUserId: OWNER,
        threadId: THREAD,
        runId: RUN,
        type: "tool_approval",
        toolName: "proposeArtifact",
        payloadJson: "{}",
        status: input.pending ? "pending" : "responded",
        responseJson: input.pending
          ? undefined
          : JSON.stringify({ kind: "approval", approved: true }),
        createdAt: input.runUpdatedAt,
        respondedAt: input.pending ? undefined : input.respondedAt,
      });
    });
  }

  async function scheduledResumeCount(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query("_scheduled_functions").collect();
      return jobs.filter((job) => job.name.includes("forwardResume")).length;
    });
  }

  it("re-forwards a lost resume for a responded waiting_hitl run", async () => {
    const t = setup();
    const past = Date.now() - 10 * 60 * 1000;
    await seedWaitingRun(t, {
      runUpdatedAt: past,
      respondedAt: past + 60 * 1000,
    });
    await t.mutation(internal.agent.watchdogSweep, {});
    expect(await scheduledResumeCount(t)).toBe(1);
    // The run itself is untouched — the service flips it on actual resume.
    const run = await t.query(api.agent.service.getRun, {
      serviceToken: TOKEN,
      runId: RUN,
    });
    expect(run!.status).toBe("waiting_hitl");
  });

  it("does not forward when the run moved after the response", async () => {
    const t = setup();
    const now = Date.now();
    await seedWaitingRun(t, {
      runUpdatedAt: now - 60 * 1000,
      respondedAt: now - 5 * 60 * 1000,
    });
    await t.mutation(internal.agent.watchdogSweep, {});
    expect(await scheduledResumeCount(t)).toBe(0);
  });

  it("does not forward for still-pending interactions or fresh responses", async () => {
    const t = setup();
    await seedWaitingRun(t, {
      runUpdatedAt: Date.now() - 10 * 60 * 1000,
      pending: true,
    });
    await t.mutation(internal.agent.watchdogSweep, {});
    expect(await scheduledResumeCount(t)).toBe(0);

    // Fresh response (< grace window) is left to the respond-path forward.
    const t2 = setup();
    await seedWaitingRun(t2, {
      runUpdatedAt: Date.now() - 10 * 60 * 1000,
      respondedAt: Date.now() - 5 * 1000,
    });
    await t2.mutation(internal.agent.watchdogSweep, {});
    expect(await scheduledResumeCount(t2)).toBe(0);
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
        await ctx.db.insert("agentRuns", {
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
    await t.mutation(internal.agent.watchdogSweep, {});
    const statuses = await t.run(async (ctx) => {
      const runs = await ctx.db.query("agentRuns").collect();
      return Object.fromEntries(runs.map((run) => [run.runId, run.status]));
    });
    expect(statuses).toEqual({
      "run_stalled-queued": "failed",
      "run_stalled-running": "failed",
      "run_waiting-user": "waiting_hitl",
    });
  });
});

describe("account cleanup of agent tables (Step 6a)", () => {
  async function seedOwner(t: ReturnType<typeof convexTest>, owner: string, thread: string, run: string) {
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("chatThreads", {
        threadId: thread,
        ownerUserId: owner,
        agentKind: "lite",
        status: "idle",
        lastActivityAt: now,
        messageCount: 2,
      });
      await ctx.db.insert("chatMessages", {
        threadId: thread,
        ownerUserId: owner,
        role: "user",
        text: "hai",
        status: "complete",
        createdAt: now,
      });
      await ctx.db.insert("agentRuns", {
        runId: run,
        threadId: thread,
        ownerUserId: owner,
        agentKind: "lite",
        mode: "deep",
        status: "completed",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("agentRunEvents", {
        runId: run,
        seq: 0,
        type: "run_status",
        payloadJson: "{}",
        createdAt: now,
      });
      await ctx.db.insert("researchPhaseStates", {
        runId: run,
        phase: "plan",
        status: "done",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("pendingInteractions", {
        ownerUserId: owner,
        threadId: thread,
        runId: run,
        type: "ask_user",
        toolName: "askUser",
        payloadJson: "{}",
        status: "pending",
        createdAt: now,
      });
    });
  }

  async function countAll(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => ({
      threads: (await ctx.db.query("chatThreads").collect()).length,
      messages: (await ctx.db.query("chatMessages").collect()).length,
      runs: (await ctx.db.query("agentRuns").collect()).length,
      events: (await ctx.db.query("agentRunEvents").collect()).length,
      phases: (await ctx.db.query("researchPhaseStates").collect()).length,
      interactions: (await ctx.db.query("pendingInteractions").collect()).length,
    }));
  }

  it("cascade-deletes only the target owner's agent data", async () => {
    const t = setup();
    await seedOwner(t, OWNER, "thr_a", "run_a");
    await seedOwner(t, "owner-other", "thr_b", "run_b");

    const deleted = await t.run(async (ctx) => deleteAgentData(ctx, OWNER));
    expect(deleted).toBeGreaterThan(0);

    const after = await countAll(t);
    // Exactly the other owner's single set of rows survives.
    expect(after).toEqual({
      threads: 1,
      messages: 1,
      runs: 1,
      events: 1,
      phases: 1,
      interactions: 1,
    });
    const survivor = await t.run(async (ctx) =>
      ctx.db
        .query("chatThreads")
        .withIndex("by_owner_activity", (q) => q.eq("ownerUserId", "owner-other"))
        .unique(),
    );
    expect(survivor?.threadId).toBe("thr_b");
  });

  it("is a no-op for an owner with no agent data", async () => {
    const t = setup();
    const deleted = await t.run(async (ctx) => deleteAgentData(ctx, "nobody"));
    expect(deleted).toBe(0);
  });
});

describe("research sources (WS6)", () => {
  const IDENTITY = { tokenIdentifier: OWNER, subject: OWNER };

  function sourceFixture(n: number, query: string) {
    return {
      citationNumber: n,
      origin: "web" as const,
      evidenceStrength: "medium" as const,
      title: `Source ${n}`,
      locator: `loc-${n}`,
      snippet: `snippet ${n}`,
      url: `https://example.com/${n}`,
      discoveryQuery: query,
      usage: "candidate" as const,
    };
  }

  async function seedThreadRun(t: ReturnType<typeof convexTest>) {
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
    });
  }

  it("insertSources persists run/owner-scoped rows with discoveryQuery + citationNumber", async () => {
    const t = setup();
    await seedThreadRun(t);
    const result = await t.mutation(api.agent.service.insertSources, {
      serviceToken: TOKEN,
      runId: RUN,
      threadId: THREAD,
      ownerUserId: OWNER,
      sources: [sourceFixture(1, "ai tutoring"), sourceFixture(2, "ai tutoring")],
    });
    expect(result).toEqual({ inserted: 2 });

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("researchSources")
        .withIndex("by_run", (q) => q.eq("runId", RUN))
        .collect(),
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.citationNumber).sort()).toEqual([1, 2]);
    expect(rows.every((r) => r.discoveryQuery === "ai tutoring")).toBe(true);
    expect(rows.every((r) => r.threadId === THREAD && r.ownerUserId === OWNER)).toBe(true);
  });

  it("rejects insertSources without a valid service token", async () => {
    const t = setup();
    await expect(
      t.mutation(api.agent.service.insertSources, {
        serviceToken: "wrong",
        runId: RUN,
        threadId: THREAD,
        ownerUserId: OWNER,
        sources: [sourceFixture(1, "q")],
      }),
    ).rejects.toThrow();
  });

  it("listSourcesByThread returns the owner's sources (runId preserved) and hides them from others", async () => {
    const t = setup();
    await seedThreadRun(t);
    await t.mutation(api.agent.service.insertSources, {
      serviceToken: TOKEN,
      runId: RUN,
      threadId: THREAD,
      ownerUserId: OWNER,
      sources: [sourceFixture(1, "ai tutoring"), sourceFixture(2, "unesco")],
    });

    const owned = await t
      .withIdentity(IDENTITY)
      .query(api.agent.queries.listSourcesByThread, { threadId: THREAD });
    expect(owned).toHaveLength(2);
    expect(owned.every((s) => s.runId === RUN)).toBe(true);
    expect(owned.every((s) => s.usage === "candidate")).toBe(true);
    expect(owned.map((s) => s.discoveryQuery).sort()).toEqual(["ai tutoring", "unesco"]);

    const foreign = await t
      .withIdentity({ tokenIdentifier: "intruder", subject: "intruder" })
      .query(api.agent.queries.listSourcesByThread, { threadId: THREAD });
    expect(foreign).toHaveLength(0);
  });
});
