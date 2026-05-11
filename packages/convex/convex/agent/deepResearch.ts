import { generateObject, generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { WorkflowId } from "@convex-dev/workflow";
import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { searchArxivProvider, searchWebProvider } from "./externalProviders";
import { corpusRag, userNamespace } from "./rag";
import { trimForSnippet, type SourceCandidate } from "./sourceCandidates";
import { assertThreadOwner } from "./threads";
import { researchWorkflow } from "./workflow";

const DEEP_MODEL = process.env.AQSHA_DEEP_MODEL ?? "gpt-5.5";
const ARTIFACT_INLINE_LIMIT = 800_000;

const stepDefinitions = [
  ["planResearch", "Merencanakan riset"],
  ["retrieveSources", "Mencari sumber"],
  ["readExtract", "Membaca dan mengutip"],
  ["synthesize", "Menyusun laporan"],
  ["verifyCitations", "Memeriksa kutipan"],
  ["persistArtifact", "Menyimpan hasil"],
  ["finalizeThread", "Menutup riset"],
] as const;

const artifactTypeValidator = v.union(
  v.literal("markdown_report"),
  v.literal("research_document"),
  v.literal("source_bundle"),
  v.literal("citation_evidence_view"),
);

const runStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("waiting"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled"),
);

const stepStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled"),
);

export const deepResearchWorkflow = researchWorkflow.define({
  args: {
    runId: v.id("researchRuns"),
    ownerUserId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
    prompt: v.string(),
  },
  handler: async (step, args): Promise<void> => {
    const plan = await step.runAction(internal.agent.deepResearch.planResearch, args);
    const sources = await step.runAction(internal.agent.deepResearch.retrieveSources, {
      ...args,
      plan,
    });
    const extracts = await step.runAction(internal.agent.deepResearch.readExtract, {
      ...args,
      plan,
      sources,
    });
    const synthesis = await step.runAction(internal.agent.deepResearch.synthesize, {
      ...args,
      plan,
      sources,
      extracts,
    });
    const checks = await step.runAction(internal.agent.deepResearch.verifyCitations, {
      ...args,
      sources,
      markdown: synthesis.markdown,
    });
    const persisted = await step.runMutation(internal.agent.deepResearch.persistArtifact, {
      ...args,
      sources,
      markdown: synthesis.markdown,
      checks,
    });
    await step.runMutation(internal.agent.deepResearch.finalizeThread, {
      ...args,
      artifactId: persisted.primaryArtifactId,
      summary: synthesis.summary,
    });
  },
});

export const getStatus = query({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const run = await ctx.db.get(args.runId);
    if (!run || run.ownerUserId !== user._id) {
      return null;
    }
    const steps = await listSteps(ctx, user._id, args.runId);
    return { ...run, steps };
  },
});

export const listForThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertThreadOwner(ctx, args.threadId);
    const runs = await ctx.db
      .query("researchRuns")
      .withIndex("by_owner_thread_created", (q) =>
        q.eq("ownerUserId", user._id).eq("threadId", args.threadId),
      )
      .order("desc")
      .take(20);
    const rows = await Promise.all(
      runs.map(async (run) => ({ ...run, steps: await listSteps(ctx, user._id, run._id) })),
    );
    return rows.reverse();
  },
});

export const cancel = mutation({
  args: { runId: v.id("researchRuns") },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const run = await ctx.db.get(args.runId);
    if (!run || run.ownerUserId !== user._id) {
      throw new ConvexError("Run not found");
    }
    if (run.status === "completed" || run.status === "canceled") {
      return { ok: true };
    }
    await markCanceled(ctx, run._id, user._id);
    if (run.workflowId) {
      await researchWorkflow.cancel(ctx, run.workflowId as unknown as WorkflowId);
    }
    return { ok: true };
  },
});

export const retry = mutation({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args): Promise<{ ok: true; runId: Id<"researchRuns">; workflowId: string }> => {
    const user = await requireCurrentUser(ctx);
    const run = await ctx.db.get(args.runId);
    if (!run || run.ownerUserId !== user._id) {
      throw new ConvexError("Run not found");
    }
    if (run.status !== "failed" || !run.retryable) {
      throw new ConvexError("Run is not retryable");
    }
    const prompt = await readPromptMessage(ctx, run.promptMessageId);
    const newRunId = await createRun(ctx, {
      ownerUserId: user._id,
      threadId: run.threadId,
      promptMessageId: run.promptMessageId,
      retryOfRunId: run._id,
    });
    const workflowId = await researchWorkflow.start(
      ctx,
      internal.agent.deepResearch.deepResearchWorkflow,
      {
        runId: newRunId,
        ownerUserId: user._id,
        threadId: run.threadId,
        promptMessageId: run.promptMessageId,
        prompt,
      },
      {
        onComplete: internal.agent.deepResearch.handleWorkflowComplete,
        context: { runId: newRunId, ownerUserId: user._id },
      },
    );
    const workflowIdString = String(workflowId);
    await ctx.db.patch(newRunId, { workflowId: workflowIdString, updatedAt: Date.now() });
    return { ok: true as const, runId: newRunId, workflowId: workflowIdString };
  },
});

export const listArtifacts = query({
  args: { threadId: v.string(), runId: v.optional(v.id("researchRuns")) },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertThreadOwner(ctx, args.threadId);
    if (args.runId) {
      await assertRunOwner(ctx, args.runId, user._id);
      return await ctx.db
        .query("researchArtifacts")
        .withIndex("by_owner_run", (q) =>
          q.eq("ownerUserId", user._id).eq("runId", args.runId!),
        )
        .collect();
    }
    return await ctx.db
      .query("researchArtifacts")
      .withIndex("by_owner_thread_created", (q) =>
        q.eq("ownerUserId", user._id).eq("threadId", args.threadId),
      )
      .order("desc")
      .take(50);
  },
});

export const getArtifact = query({
  args: { artifactId: v.id("researchArtifacts") },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || artifact.ownerUserId !== user._id) {
      return null;
    }
    return artifact;
  },
});

export const listCitationChecks = query({
  args: { artifactId: v.id("researchArtifacts") },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || artifact.ownerUserId !== user._id) {
      return [];
    }
    return await ctx.db
      .query("citationChecks")
      .withIndex("by_owner_artifact", (q) =>
        q.eq("ownerUserId", user._id).eq("artifactId", args.artifactId),
      )
      .collect();
  },
});

export const startForMessage = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
    prompt: v.string(),
  },
  handler: async (ctx, args): Promise<{ runId: Id<"researchRuns">; workflowId: string }> => {
    const runId = await createRun(ctx, args);
    const workflowId = await researchWorkflow.start(
      ctx,
      internal.agent.deepResearch.deepResearchWorkflow,
      { runId, ...args },
      {
        onComplete: internal.agent.deepResearch.handleWorkflowComplete,
        context: { runId, ownerUserId: args.ownerUserId },
      },
    );
    const workflowIdString = String(workflowId);
    await ctx.db.patch(runId, { workflowId: workflowIdString, updatedAt: Date.now() });
    return { runId, workflowId: workflowIdString };
  },
});

export const planResearch = internalAction({
  args: workflowArgs(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "planResearch",
      status: "running",
    });
    const object = await generateObject({
      model: openai.chat(DEEP_MODEL),
      schema: z.object({
        title: z.string(),
        questions: z.array(z.string()).min(1).max(5),
        sourceQueries: z.array(z.string()).min(1).max(5),
        artifactTarget: z.string(),
      }),
      prompt: `Create a concise research plan for this prompt. Prefer source-grounded academic/product research.\n\n${args.prompt}`,
    });
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "planResearch",
      status: "completed",
      summary: object.object.title,
    });
    return object.object;
  },
});

export const retrieveSources = internalAction({
  args: { ...workflowArgs(), plan: v.any() },
  handler: async (ctx, args) => {
    await ensureNotCanceled(ctx, args.runId);
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "retrieveSources",
      status: "running",
    });
    const queries = normalizeQueries(args.plan, args.prompt);
    const corpusResults = await Promise.all(
      queries.slice(0, 3).map((query) =>
        corpusRag.search(ctx, {
          namespace: userNamespace(args.ownerUserId),
          query,
          limit: 4,
          vectorScoreThreshold: 0.35,
        }),
      ),
    );
    const corpusCandidates = corpusResults.flatMap((result) =>
      result.entries.map((entry) => ({
        origin: "corpus" as const,
        evidenceStrength: "strong" as const,
        title: entry.metadata?.title ?? entry.title ?? "Corpus source",
        locator: entry.metadata?.locator ?? entry.entryId,
        url: entry.metadata?.url,
        doi: entry.metadata?.doi,
        arxivId: entry.metadata?.arxivId,
        snippet: trimForSnippet(entry.text || result.text || "Corpus match", 1_200),
        corpusSourceId: entry.metadata?.corpusSourceId as Id<"corpusSources"> | undefined,
      })),
    );
    const externalNeeded = corpusCandidates.length < 4;
    const [arxiv, web] = externalNeeded
      ? await Promise.all([
          searchArxivProvider(ctx, {
            ownerUserId: args.ownerUserId,
            query: queries[0],
            limit: 4,
          }),
          searchWebProvider(ctx, {
            ownerUserId: args.ownerUserId,
            query: queries[0],
            limit: 4,
          }),
        ])
      : [[], []];
    const sources = dedupeSources([...corpusCandidates, ...arxiv, ...web]).map(
      (source, index) => ({ ...source, citationNumber: index + 1 }),
    );
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "retrieveSources",
      status: "completed",
      summary: `${sources.length} sumber ditemukan`,
      sourceCount: sources.length,
    });
    return sources;
  },
});

export const readExtract = internalAction({
  args: { ...workflowArgs(), plan: v.any(), sources: v.array(sourceRuntimeValidator()) },
  handler: async (ctx, args) => {
    await ensureNotCanceled(ctx, args.runId);
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "readExtract",
      status: "running",
    });
    const extracts = args.sources.map((source) => ({
      citationNumber: source.citationNumber,
      title: source.title,
      locator: source.locator,
      evidence: source.snippet,
    }));
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "readExtract",
      status: "completed",
      summary: `${extracts.length} kutipan siap dipakai`,
    });
    return extracts;
  },
});

export const synthesize = internalAction({
  args: {
    ...workflowArgs(),
    plan: v.any(),
    sources: v.array(sourceRuntimeValidator()),
    extracts: v.any(),
  },
  handler: async (ctx, args) => {
    await ensureNotCanceled(ctx, args.runId);
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "synthesize",
      status: "running",
    });
    const sourceBlock = args.sources
      .map((source) => `[${source.citationNumber}] ${source.title}: ${source.snippet}`)
      .join("\n");
    const result = await generateText({
      model: openai.chat(DEEP_MODEL),
      system:
        "Write a source-grounded markdown research report. Cite every factual claim with persisted source numbers. If evidence is insufficient, keep that limitation visible.",
      prompt: `Prompt:\n${args.prompt}\n\nSources:\n${sourceBlock}`,
    });
    const markdown = result.text.trim();
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "synthesize",
      status: "completed",
      summary: "Laporan markdown tersusun",
    });
    return {
      markdown,
      summary: trimForSnippet(markdown.replace(/[#*_`>-]/g, ""), 220),
    };
  },
});

export const verifyCitations = internalAction({
  args: {
    ...workflowArgs(),
    sources: v.array(sourceRuntimeValidator()),
    markdown: v.string(),
  },
  handler: async (ctx, args) => {
    await ensureNotCanceled(ctx, args.runId);
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "verifyCitations",
      status: "running",
    });
    const cited = extractCitationNumbers(args.markdown);
    const checks = splitClaims(args.markdown).slice(0, 12).map((claim) => {
      const claimCitations = [...extractCitationNumbers(claim)];
      const support: "supported" | "partial" | "unsupported" =
        claimCitations.length > 0 && claimCitations.every((n) => cited.has(n))
          ? "supported"
          : claimCitations.length > 0
            ? "partial"
            : "unsupported";
      return { claim, support, citationNumbers: claimCitations, evidence: evidenceText(support) };
    });
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "verifyCitations",
      status: "completed",
      summary: `${checks.length} klaim diperiksa`,
    });
    return checks;
  },
});

export const persistArtifact = internalMutation({
  args: {
    ...workflowArgs(),
    sources: v.array(sourceRuntimeValidator()),
    markdown: v.string(),
    checks: v.array(
      v.object({
        claim: v.string(),
        support: v.union(v.literal("supported"), v.literal("partial"), v.literal("unsupported")),
        citationNumbers: v.array(v.number()),
        evidence: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const run = await assertRunOwner(ctx, args.runId, args.ownerUserId);
    if (run.status === "canceled") {
      return { primaryArtifactId: run.activeArtifactId as Id<"researchArtifacts"> };
    }
    await markStepMutation(ctx, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "persistArtifact",
      status: "running",
    });
    const sourceIds = await persistSourcesForRun(ctx, args);
    const now = Date.now();
    const reportId = await ctx.db.insert("researchArtifacts", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      type: "markdown_report",
      title: "Deep Research Report",
      markdown: args.markdown.length <= ARTIFACT_INLINE_LIMIT ? args.markdown : undefined,
      createdAt: now,
      updatedAt: now,
    });
    const bundleId = await ctx.db.insert("researchArtifacts", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      type: "source_bundle",
      title: "Source Bundle",
      markdown: args.sources
        .map((source) => `- [${source.citationNumber}] ${source.title}\n  ${source.snippet}`)
        .join("\n"),
      createdAt: now,
      updatedAt: now,
    });
    const evidenceId = await ctx.db.insert("researchArtifacts", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      type: "citation_evidence_view",
      title: "Citation Evidence",
      markdown: args.checks
        .map((check) => `- ${check.support}: ${check.claim}`)
        .join("\n"),
      createdAt: now,
      updatedAt: now,
    });
    await persistCitationChecks(ctx, {
      ...args,
      artifactId: evidenceId,
      sourceIdsByNumber: sourceIds,
    });
    await markStepMutation(ctx, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "persistArtifact",
      status: "completed",
      artifactCount: 3,
      summary: "Artefak tersimpan",
    });
    await ctx.db.patch(args.runId, {
      activeArtifactId: reportId,
      artifactCount: 3,
      sourceCount: args.sources.length,
      citationCheckCount: args.checks.length,
      updatedAt: now,
    });
    return { primaryArtifactId: reportId, bundleId, evidenceId };
  },
});

export const finalizeThread = internalMutation({
  args: {
    ...workflowArgs(),
    artifactId: v.id("researchArtifacts"),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await assertRunOwner(ctx, args.runId, args.ownerUserId);
    if (run.status === "canceled") {
      return;
    }
    await markStepMutation(ctx, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "finalizeThread",
      status: "running",
    });
    await ctx.runMutation(internal.agent.messages.saveAssistantMessage, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      promptMessageId: args.promptMessageId,
      content: `${args.summary}\n\nArtefak riset sudah tersimpan.`,
    });
    const now = Date.now();
    await markStepMutation(ctx, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "finalizeThread",
      status: "completed",
      summary: "Riset selesai",
    });
    await ctx.db.patch(args.runId, {
      status: "completed",
      currentStep: "finalizeThread",
      retryable: false,
      completedAt: now,
      updatedAt: now,
    });
  },
});

export const handleWorkflowComplete = internalMutation({
  args: {
    workflowId: v.string(),
    result: v.any(),
    context: v.any(),
  },
  handler: async (ctx, args) => {
    const runId = args.context?.runId as Id<"researchRuns"> | undefined;
    const ownerUserId = args.context?.ownerUserId as string | undefined;
    if (!runId || !ownerUserId) {
      return;
    }
    const run = await ctx.db.get(runId);
    if (!run || run.ownerUserId !== ownerUserId || run.status === "completed") {
      return;
    }
    if (args.result?.kind === "canceled" || run.status === "canceled") {
      await markCanceled(ctx, runId, ownerUserId);
      return;
    }
    if (args.result?.kind === "error") {
      await failRun(ctx, {
        runId,
        ownerUserId,
        stepKey: run.currentStep ?? "planResearch",
        code: "workflow_failed",
        message: String(args.result.error ?? "Deep research failed"),
      });
    }
  },
});

export const markStep = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    ownerUserId: v.string(),
    stepKey: v.string(),
    status: stepStatusValidator,
    summary: v.optional(v.string()),
    sourceCount: v.optional(v.number()),
    artifactCount: v.optional(v.number()),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => markStepMutation(ctx, args),
});

async function createRun(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    promptMessageId: string;
    retryOfRunId?: Id<"researchRuns">;
  },
) {
  const now = Date.now();
  const runId = await ctx.db.insert("researchRuns", {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    promptMessageId: args.promptMessageId,
    status: "queued",
    artifactCount: 0,
    sourceCount: 0,
    citationCheckCount: 0,
    retryOfRunId: args.retryOfRunId,
    retryable: false,
    createdAt: now,
    updatedAt: now,
  });
  await Promise.all(
    stepDefinitions.map(([stepKey, label], order) =>
      ctx.db.insert("researchRunSteps", {
        ownerUserId: args.ownerUserId,
        runId,
        stepKey,
        label,
        order,
        status: "pending",
        updatedAt: now,
      }),
    ),
  );
  return runId;
}

async function listSteps(ctx: QueryCtx, ownerUserId: string, runId: Id<"researchRuns">) {
  return await ctx.db
    .query("researchRunSteps")
    .withIndex("by_owner_run", (q) => q.eq("ownerUserId", ownerUserId).eq("runId", runId))
    .collect();
}

async function assertRunOwner(ctx: QueryCtx | MutationCtx, runId: Id<"researchRuns">, ownerUserId: string) {
  const run = await ctx.db.get(runId);
  if (!run || run.ownerUserId !== ownerUserId) {
    throw new ConvexError("Run not found");
  }
  return run;
}

async function markStepMutation(
  ctx: MutationCtx,
  args: {
    runId: Id<"researchRuns">;
    ownerUserId: string;
    stepKey: string;
    status: "pending" | "running" | "completed" | "failed" | "canceled";
    summary?: string;
    sourceCount?: number;
    artifactCount?: number;
    failureReason?: string;
  },
) {
  const now = Date.now();
  const step = await ctx.db
    .query("researchRunSteps")
    .withIndex("by_owner_run", (q) => q.eq("ownerUserId", args.ownerUserId).eq("runId", args.runId))
    .filter((q) => q.eq(q.field("stepKey"), args.stepKey))
    .unique();
  if (step) {
    await ctx.db.patch(step._id, {
      status: args.status,
      summary: args.summary ?? step.summary,
      sourceCount: args.sourceCount ?? step.sourceCount,
      artifactCount: args.artifactCount ?? step.artifactCount,
      failureReason: args.failureReason ?? step.failureReason,
      startedAt: args.status === "running" ? (step.startedAt ?? now) : step.startedAt,
      completedAt:
        args.status === "completed" || args.status === "failed" || args.status === "canceled"
          ? now
          : step.completedAt,
      updatedAt: now,
    });
  }
  if (args.status === "running") {
    await ctx.db.patch(args.runId, {
      status: "running",
      currentStep: args.stepKey,
      updatedAt: now,
    });
  }
}

async function markCanceled(ctx: MutationCtx, runId: Id<"researchRuns">, ownerUserId: string) {
  const now = Date.now();
  await ctx.db.patch(runId, {
    status: "canceled",
    canceledAt: now,
    retryable: false,
    updatedAt: now,
  });
  const steps = await ctx.db
    .query("researchRunSteps")
    .withIndex("by_owner_run", (q) => q.eq("ownerUserId", ownerUserId).eq("runId", runId))
    .collect();
  await Promise.all(
    steps
      .filter((step) => step.status === "pending" || step.status === "running")
      .map((step) => ctx.db.patch(step._id, { status: "canceled", completedAt: now, updatedAt: now })),
  );
}

async function failRun(
  ctx: MutationCtx,
  args: {
    runId: Id<"researchRuns">;
    ownerUserId: string;
    stepKey: string;
    code: string;
    message: string;
  },
) {
  await markStepMutation(ctx, {
    runId: args.runId,
    ownerUserId: args.ownerUserId,
    stepKey: args.stepKey,
    status: "failed",
    failureReason: args.message,
  });
  await ctx.db.patch(args.runId, {
    status: "failed",
    failedStep: args.stepKey,
    retryable: true,
    errorCode: args.code,
    errorMessage: args.message,
    updatedAt: Date.now(),
  });
}

async function ensureNotCanceled(
  ctx: { runQuery: (ref: typeof internal.agent.deepResearch.getInternalRun, args: { runId: Id<"researchRuns"> }) => Promise<{ status: string } | null> },
  runId: Id<"researchRuns">,
) {
  const run = await ctx.runQuery(internal.agent.deepResearch.getInternalRun, { runId });
  if (run?.status === "canceled") {
    throw new ConvexError("Run canceled");
  }
}

export const getInternalRun = internalQuery({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args) => await ctx.db.get(args.runId),
});

async function readPromptMessage(_ctx: MutationCtx, messageId: string) {
  return `Retry deep research for message ${messageId}`;
}

function workflowArgs() {
  return {
    runId: v.id("researchRuns"),
    ownerUserId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
    prompt: v.string(),
  };
}

function sourceRuntimeValidator() {
  return v.object({
    citationNumber: v.number(),
    origin: v.union(v.literal("corpus"), v.literal("web"), v.literal("arxiv"), v.literal("doi")),
    evidenceStrength: v.union(v.literal("strong"), v.literal("medium"), v.literal("weak")),
    title: v.string(),
    locator: v.string(),
    url: v.optional(v.string()),
    doi: v.optional(v.string()),
    arxivId: v.optional(v.string()),
    snippet: v.string(),
    corpusSourceId: v.optional(v.id("corpusSources")),
  });
}

function normalizeQueries(plan: unknown, prompt: string) {
  const queries = (plan as { sourceQueries?: unknown })?.sourceQueries;
  if (Array.isArray(queries)) {
    return queries.filter((query): query is string => typeof query === "string" && query.trim().length > 0);
  }
  return [prompt];
}

function dedupeSources(sources: Array<Omit<SourceCandidate, "citationNumber">>) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = (source.doi ?? source.arxivId ?? source.url ?? source.locator).toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function extractCitationNumbers(text: string) {
  return new Set([...text.matchAll(/\[(\d{1,3})\]/g)].map((match) => Number(match[1])));
}

function splitClaims(markdown: string) {
  return markdown
    .split(/(?<=[.!?])\s+|\n+/)
    .map((claim) => claim.replace(/^#+\s*/, "").trim())
    .filter((claim) => claim.length > 20);
}

function evidenceText(support: "supported" | "partial" | "unsupported") {
  if (support === "supported") {
    return "Claim includes persisted citation markers.";
  }
  if (support === "partial") {
    return "Claim has citations but support should be reviewed.";
  }
  return "No persisted citation marker found for this claim.";
}

async function persistSourcesForRun(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    runId: Id<"researchRuns">;
    sources: SourceCandidate[];
  },
) {
  const now = Date.now();
  const ids = new Map<number, Id<"researchSources">>();
  for (const source of args.sources) {
    const sourceId = await ctx.db.insert("researchSources", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      citationNumber: source.citationNumber,
      origin: source.origin,
      evidenceStrength: source.evidenceStrength,
      title: source.title,
      locator: source.locator,
      url: source.url,
      doi: source.doi,
      arxivId: source.arxivId,
      snippet: source.snippet,
      corpusSourceId: source.corpusSourceId,
      createdAt: now,
    });
    ids.set(source.citationNumber, sourceId);
  }
  return ids;
}

async function persistCitationChecks(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    runId: Id<"researchRuns">;
    artifactId: Id<"researchArtifacts">;
    checks: Array<{
      claim: string;
      support: "supported" | "partial" | "unsupported";
      citationNumbers: number[];
      evidence: string;
    }>;
    sourceIdsByNumber: Map<number, Id<"researchSources">>;
  },
) {
  const now = Date.now();
  await Promise.all(
    args.checks.map((check) =>
      ctx.db.insert("citationChecks", {
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        runId: args.runId,
        artifactId: args.artifactId,
        claim: check.claim,
        support: check.support,
        sourceIds: check.citationNumbers
          .map((number) => args.sourceIdsByNumber.get(number))
          .filter((id): id is Id<"researchSources"> => Boolean(id)),
        evidence: check.evidence,
        createdAt: now,
      }),
    ),
  );
}
