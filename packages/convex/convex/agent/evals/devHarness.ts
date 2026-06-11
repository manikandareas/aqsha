import { createThread, listUIMessages } from "@convex-dev/agent";
import { v } from "convex/values";
import { components, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../../_generated/server";
import { throwAppError } from "../../lib/appError";
import { PENDING_HITL_TOOL_NAME_SET } from "../hitl/hitlToolNames";
import { cancelRunForOwner } from "../research/deepResearch";
import { astra } from "../runtime";

// Dev-only headless deep-run harness (Slice R0). Drives the SAME production
// path a user takes — saved prompt message → startForMessage → generateDeepPlan
// → plan approval (needsApproval) → deepResearchExecuteWorkflow — but through
// internal functions so `scripts/smoke-deep-research.mjs` can run the whole
// cycle against the dev deployment without a browser. Every entrypoint is
// guarded by AQSHA_DEV_HARNESS=1 so none of this is callable on prod.

export function assertDevHarnessEnabled(): void {
  if (process.env.AQSHA_DEV_HARNESS !== "1") {
    throwAppError({
      code: "dev_harness_disabled",
      message: "Dev harness dinonaktifkan (set AQSHA_DEV_HARNESS=1 pada deployment dev).",
      severity: "error",
    });
  }
}

const DEFAULT_SMOKE_PROMPT = [
  "Lakukan riset mendalam: apakah intervensi mindfulness berbasis aplikasi efektif",
  "menurunkan kecemasan pada mahasiswa? Bandingkan efek antar studi, sertakan",
  "ukuran efek bila tersedia, dan soroti kualitas bukti serta counter-evidence.",
].join(" ");

// ── Start ─────────────────────────────────────────────────────────────────────

// Creates a thread for the harness user, saves the deep prompt as a real user
// message, and enters production's deep entry seam (startForMessage → schedules
// generateDeepPlan). Returns the ids the driver script polls with.
export const startSmokeRun = internalMutation({
  args: {
    ownerUserId: v.string(),
    prompt: v.optional(v.string()),
    agentKind: v.optional(v.union(v.literal("lite"), v.literal("pro"))),
  },
  returns: v.object({
    threadId: v.string(),
    runId: v.id("agentRuns"),
    promptMessageId: v.string(),
  }),
  handler: async (ctx, args) => {
    assertDevHarnessEnabled();
    const prompt = args.prompt?.trim() || DEFAULT_SMOKE_PROMPT;
    const threadId = await createThread(ctx, components.agent, {
      userId: args.ownerUserId,
      title: "Smoke: deep research",
    });
    const saved = await astra.saveMessages(ctx, {
      threadId,
      userId: args.ownerUserId,
      messages: [{ role: "user", content: prompt }],
      skipEmbeddings: true,
    });
    const promptMessageId = saved.messages[0]._id;
    await ctx.db.insert("threadMetadata", {
      ownerUserId: args.ownerUserId,
      threadId,
      lastActivityAt: Date.now(),
      lastMessagePreview: prompt.slice(0, 120),
      messageCount: 1,
      status: "streaming",
      lastAgentKind: args.agentKind ?? "pro",
    });
    const run: { runId: Id<"agentRuns"> } = await ctx.runMutation(
      internal.agent.research.deepResearch.startForMessage,
      {
        ownerUserId: args.ownerUserId,
        threadId,
        promptMessageId,
        prompt,
        agentKind: args.agentKind ?? "pro",
      },
    );
    return { threadId, runId: run.runId, promptMessageId };
  },
});

// ── Pending-HITL discovery + resolution ───────────────────────────────────────

type PendingHitlPart =
  | { kind: "approval"; toolName: string; approvalId: string }
  | { kind: "askUser"; toolName: string; toolCallId: string };

function toolNameForPart(part: Record<string, unknown>): string | null {
  const type = part.type;
  if (typeof type !== "string") return null;
  if (type === "dynamic-tool") {
    return typeof part.toolName === "string" ? part.toolName : null;
  }
  if (type.startsWith("tool-")) return type.slice("tool-".length);
  return null;
}

const pendingHitlPartValidator = v.union(
  v.object({
    kind: v.literal("approval"),
    toolName: v.string(),
    approvalId: v.string(),
  }),
  v.object({
    kind: v.literal("askUser"),
    toolName: v.string(),
    toolCallId: v.string(),
  }),
);

// Mirrors the web client's pending detection (hitl-parts.ts): a tool part in
// `approval-requested`, or an askUser call still in `input-available`.
export const listPendingHitl = internalQuery({
  args: { threadId: v.string() },
  returns: v.array(pendingHitlPartValidator),
  handler: async (ctx, args): Promise<PendingHitlPart[]> => {
    assertDevHarnessEnabled();
    const paginated = await listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: { numItems: 100, cursor: null },
    });
    const pending: PendingHitlPart[] = [];
    for (const message of paginated.page) {
      for (const raw of message.parts ?? []) {
        const part = raw as unknown as Record<string, unknown>;
        const toolName = toolNameForPart(part);
        if (!toolName || !PENDING_HITL_TOOL_NAME_SET.has(toolName)) continue;
        const state = typeof part.state === "string" ? part.state : "";
        const approval = part.approval as { id?: string } | undefined;
        if (state === "approval-requested" && approval?.id) {
          pending.push({ kind: "approval", toolName, approvalId: approval.id });
        } else if (
          toolName === "askUser" &&
          state === "input-available" &&
          typeof part.toolCallId === "string"
        ) {
          pending.push({ kind: "askUser", toolName, toolCallId: part.toolCallId });
        }
      }
    }
    return pending;
  },
});

// Same flip the UI's resumeHitl does: paused run → running, thread →
// streaming, then schedule resumeGeneration off the resolved message.
export const beginSmokeResume = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    assertDevHarnessEnabled();
    let run: Doc<"agentRuns"> | null = null;
    for (const status of ["waiting_hitl", "waiting"] as const) {
      run = await ctx.db
        .query("agentRuns")
        .withIndex("by_owner_thread_status", (q) =>
          q.eq("ownerUserId", args.ownerUserId).eq("threadId", args.threadId).eq("status", status),
        )
        .order("desc")
        .first();
      if (run) break;
    }
    const now = Date.now();
    if (run) {
      await ctx.db.patch("agentRuns", run._id, { status: "running", updatedAt: now });
    }
    const metadata = await ctx.db
      .query("threadMetadata")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .unique();
    if (metadata) {
      await ctx.db.patch("threadMetadata", metadata._id, {
        status: "streaming",
        lastActivityAt: now,
      });
    }
    await ctx.scheduler.runAfter(0, internal.agent.messages.resumeGeneration, {
      threadId: args.threadId,
      userId: args.ownerUserId,
      promptMessageId: args.promptMessageId,
      runId: run?._id,
      agentKind: run?.agentKind ?? "pro",
      deep: run?.mode === "deep",
    });
    return { ok: true };
  },
});

// Resolve every pending HITL part on the thread (approve action tools, answer
// askUser with a default), then resume generation — the scripted equivalent of
// the user clicking "Setujui" in the UI. This is also the R2 hitl-resume seam.
export const resolvePendingApprovals = internalAction({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
  },
  returns: v.object({ resolved: v.number(), resumed: v.boolean() }),
  handler: async (ctx, args): Promise<{ resolved: number; resumed: boolean }> => {
    assertDevHarnessEnabled();
    const pending: PendingHitlPart[] = await ctx.runQuery(
      internal.agent.evals.devHarness.listPendingHitl,
      { threadId: args.threadId },
    );
    let lastMessageId: string | undefined;
    for (const part of pending) {
      if (part.kind === "approval") {
        const { messageId } = await astra.approveToolCall(ctx, {
          threadId: args.threadId,
          approvalId: part.approvalId,
        });
        lastMessageId = messageId;
      } else {
        const saved = await astra.saveMessage(ctx, {
          threadId: args.threadId,
          userId: args.ownerUserId,
          message: {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: part.toolCallId,
                toolName: "askUser",
                output: {
                  type: "json",
                  value: {
                    answers: [
                      {
                        prompt: "",
                        customAnswer: "Lanjutkan dengan asumsi default yang masuk akal.",
                      },
                    ],
                  },
                },
              },
            ],
          },
          metadata: { provider: "human" },
        });
        lastMessageId = saved.messageId;
      }
    }
    if (!lastMessageId) {
      return { resolved: 0, resumed: false };
    }
    await ctx.runMutation(internal.agent.evals.devHarness.beginSmokeResume, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      promptMessageId: lastMessageId,
    });
    return { resolved: pending.length, resumed: true };
  },
});

// Debug dump of the thread's message/part states (dev-harness only) — used to
// diagnose HITL resume behavior and, in R2, to assert the resumed turn's
// context contained the RAG block.
export const dumpThread = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    assertDevHarnessEnabled();
    const paginated = await listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: { numItems: 100, cursor: null },
    });
    return paginated.page.map((message) => ({
      id: message.id,
      role: message.role,
      status: (message as unknown as { status?: string }).status ?? null,
      text: (message.text ?? "").slice(0, 200),
      parts: (message.parts ?? []).map((raw) => {
        const part = raw as unknown as Record<string, unknown>;
        return {
          type: typeof part.type === "string" ? part.type : "?",
          toolName: toolNameForPart(part),
          state: typeof part.state === "string" ? part.state : null,
          approvalId: (part.approval as { id?: string } | undefined)?.id ?? null,
          output:
            part.output !== undefined
              ? JSON.stringify(part.output).slice(0, 300)
              : null,
        };
      }),
    }));
  },
});

// ── Cancel (cancel-midrun scenario) ───────────────────────────────────────────

export const cancelSmokeRun = internalMutation({
  args: { ownerUserId: v.string(), runId: v.id("agentRuns") },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    assertDevHarnessEnabled();
    await cancelRunForOwner(ctx, args.runId, args.ownerUserId);
    return { ok: true };
  },
});

// ── Status (the driver's single polling read) ─────────────────────────────────

const EVENT_SCAN = 500;
const CITATION_SCAN = 200;
const COMPUTATION_SCAN = 200;

export const getSmokeStatus = internalQuery({
  args: { ownerUserId: v.string(), runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    assertDevHarnessEnabled();
    const run = await ctx.db.get("agentRuns", args.runId);
    if (!run || run.ownerUserId !== args.ownerUserId) return null;

    const [steps, events, citationChecks] = await Promise.all([
      ctx.db
        .query("agentRunSteps")
        .withIndex("by_owner_run", (q) =>
          q.eq("ownerUserId", args.ownerUserId).eq("runId", args.runId),
        )
        .collect(),
      ctx.db
        .query("agentRunEvents")
        .withIndex("by_owner_run_created", (q) =>
          q.eq("ownerUserId", args.ownerUserId).eq("runId", args.runId),
        )
        .take(EVENT_SCAN),
      ctx.db
        .query("citationChecks")
        .withIndex("by_owner_run", (q) =>
          q.eq("ownerUserId", args.ownerUserId).eq("runId", args.runId),
        )
        .take(CITATION_SCAN),
    ]);

    const stepEvents: Record<string, { count: number; eventTypes: string[] }> = {};
    for (const event of events) {
      const key = event.stepKey ?? "(none)";
      const bucket = (stepEvents[key] ??= { count: 0, eventTypes: [] });
      bucket.count += 1;
      if (!bucket.eventTypes.includes(event.eventType)) {
        bucket.eventTypes.push(event.eventType);
      }
    }

    const artifactId = run.activeArtifactId ?? null;
    let computationCheckCount = 0;
    if (artifactId) {
      const computations = await ctx.db
        .query("computationChecks")
        .withIndex("by_owner_artifact", (q) =>
          q.eq("ownerUserId", args.ownerUserId).eq("artifactId", artifactId),
        )
        .take(COMPUTATION_SCAN);
      computationCheckCount = computations.length;
    }

    return {
      status: run.status,
      currentStep: run.currentStep ?? null,
      failedStep: run.failedStep ?? null,
      errorCode: run.errorCode ?? null,
      errorMessage: run.errorMessage ?? null,
      roundCount: run.roundCount ?? 0,
      maxRounds: run.maxRounds ?? 0,
      sourceCount: run.sourceCount,
      artifactCount: run.artifactCount,
      citationCheckCount: run.citationCheckCount,
      sufficiencyStatus: run.sufficiencyStatus ?? "unknown",
      verificationStatus: run.verificationStatus ?? "not_started",
      budgetJson: run.budgetJson ?? null,
      draftMarkdown: Boolean(run.draftMarkdown),
      verificationReport: Boolean(run.verificationReportJson),
      artifactId,
      workflowId: run.workflowId ?? null,
      steps: steps
        .sort((a, b) => a.order - b.order)
        .map((step) => ({
          stepKey: step.stepKey,
          status: step.status,
          summary: step.summary ?? null,
        })),
      stepEvents,
      eventCount: events.length,
      citationStatuses: citationChecks.map((check) => check.support),
      computationCheckCount,
    };
  },
});
