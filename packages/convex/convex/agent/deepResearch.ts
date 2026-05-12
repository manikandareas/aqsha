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
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireCurrentUser } from "../auth";
import { estimateCredits } from "../billing/catalog";
import { consumeCredits } from "../billing/entitlements";
import {
  jinaReadUrl,
  jinaRerank,
  jinaSearchWeb,
  searchArxivProvider,
} from "./externalProviders";
import { corpusRag, userNamespace } from "./rag";
import { trimForSnippet, type SourceCandidate } from "./sourceCandidates";
import { assertThreadOwner } from "./threads";
import { researchWorkflow } from "./workflow";

const DEEP_MODEL = process.env.AQSHA_DEEP_MODEL ?? "gpt-5.5";
const DEFAULT_MAX_ROUNDS = Number(process.env.AQSHA_DEEP_MAX_ROUNDS ?? 3);
const MAX_SOURCES_PER_RUN = 14;
const MAX_EXTRACTS_PER_RUN = 24;
const ACTION_RETRY = { maxAttempts: 3, initialBackoffMs: 2_000, base: 2 };

type SufficiencyStatus =
  | "unknown"
  | "insufficient"
  | "partial"
  | "sufficient"
  | "budget_exhausted";

type ResearchPlan = {
  title: string;
  questions: string[];
  sourceStrategy: string;
  reportIntent: string;
  sufficiencyCriteria: string[];
  initialQueries: string[];
  maxRounds: number;
};

type ResearchExtract = {
  sourceKey: string;
  citationNumber: number;
  title: string;
  locator: string;
  quote: string;
  relevance: "high" | "medium" | "low";
  notes?: string;
  rerankScore?: number;
};

type ResearchRoundState = {
  round: number;
  query: string;
  gapAssessment: string;
  sufficiencyStatus: SufficiencyStatus;
  stopReason?: string;
  sources: SourceCandidate[];
  extracts: ResearchExtract[];
};

const stepDefinitions = [
  ["planResearch", "Merencanakan riset"],
  ["retrieveSources", "Mencari sumber"],
  ["readExtract", "Membaca dan mengutip"],
  ["synthesize", "Menyusun laporan"],
  ["verifyCitations", "Memeriksa kutipan"],
  ["persistArtifact", "Menyimpan hasil"],
  ["finalizeThread", "Menutup riset"],
] as const;

const stepStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled"),
);

export const deepResearchWorkflow = researchWorkflow.define({
  args: {
    runId: v.id("agentRuns"),
    ownerUserId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
    prompt: v.string(),
  },
  handler: async (step, args): Promise<void> => {
    const plan = await step.runAction(internal.agent.deepResearch.planResearch, args, {
      retry: ACTION_RETRY,
    });
    const loop = await step.runAction(internal.agent.deepResearch.researchLoop, {
      ...args,
      plan,
    }, {
      retry: ACTION_RETRY,
    });
    const synthesis = await step.runAction(internal.agent.deepResearch.synthesize, {
      ...args,
      plan,
      sources: loop.sources,
      extracts: loop.extracts,
      roundState: loop.roundState,
    }, {
      retry: ACTION_RETRY,
    });
    const audit = await step.runAction(internal.agent.deepResearch.auditClaims, {
      ...args,
      sources: loop.sources,
      extracts: loop.extracts,
      markdown: synthesis.markdown,
    }, {
      retry: ACTION_RETRY,
    });
    const responseSummary = await step.runAction(internal.agent.deepResearch.summarizeResearchResponse, {
      ...args,
      plan,
      markdown: audit.markdown,
    }, {
      retry: ACTION_RETRY,
    });
    const persisted = await step.runMutation(internal.agent.deepResearch.persistArtifact, {
      ...args,
      sources: loop.sources,
      extracts: loop.extracts,
      markdown: audit.markdown,
      checks: audit.checks,
    });
    await step.runMutation(internal.agent.deepResearch.finalizeThread, {
      ...args,
      artifactId: persisted.primaryArtifactId,
      responseSummary,
    });
  },
});

export const getStatus = query({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const run = await ctx.db.get("agentRuns", args.runId);
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
      .query("agentRuns")
      .withIndex("by_owner_thread_created", (q) =>
        q.eq("ownerUserId", user._id).eq("threadId", args.threadId),
      )
      .order("desc")
      .take(20);
    const rows = await Promise.all(
      runs.map(async (run) => {
        const [steps, events] = await Promise.all([
          listSteps(ctx, user._id, run._id),
          listEvents(ctx, user._id, run._id),
        ]);
        return { ...run, steps, events };
      }),
    );
    return rows
      .filter((run) => run.mode === "deep" || run.steps.length > 0 || run.sourceCount > 0 || run.artifactCount > 0)
      .reverse();
  },
});

export const cancel = mutation({
  args: { runId: v.id("agentRuns") },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const run = await ctx.db.get("agentRuns", args.runId);
    if (!run || run.ownerUserId !== user._id) {
      throw new ConvexError("Run not found");
    }
    if (run.status === "completed" || run.status === "canceled") {
      return { ok: true };
    }
    await markCanceled(ctx, run._id, user._id);
    if (run.workflowId) {
      try {
        await researchWorkflow.cancel(ctx, run.workflowId as unknown as WorkflowId);
      } catch (error) {
        if (!isWorkflowAlreadyStoppedError(error)) {
          throw error;
        }
      }
    }
    return { ok: true };
  },
});

export const retry = mutation({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args): Promise<{ ok: true; runId: Id<"agentRuns">; workflowId: string }> => {
    const user = await requireCurrentUser(ctx);
    const run = await ctx.db.get("agentRuns", args.runId);
    if (!run || run.ownerUserId !== user._id) {
      throw new ConvexError("Run not found");
    }
    if (run.status !== "failed" || !run.retryable) {
      throw new ConvexError("Run is not retryable");
    }
    const prompt = run.promptSnapshot || await readPromptMessage(ctx, run.promptMessageId);
    const billing = await consumeCredits(ctx, {
      ownerUserId: user._id,
      threadId: run.threadId,
      feature: "deep_research",
      provider: "openai",
      model: DEEP_MODEL,
      inputTokens: estimateTokens(prompt),
      totalTokens: estimateTokens(prompt),
      credits: estimateCredits({
        feature: "deep_research",
        inputTokens: estimateTokens(prompt),
        totalTokens: estimateTokens(prompt),
      }),
      requiredPlan: "starter",
    });
    if (!billing.ok) {
      throw new ConvexError(billing.reason);
    }
    const newRunId = await createRun(ctx, {
      ownerUserId: user._id,
      threadId: run.threadId,
      promptMessageId: run.promptMessageId,
      prompt,
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
    await ctx.db.patch("agentRuns", newRunId, { workflowId: workflowIdString, updatedAt: Date.now() });
    return { ok: true as const, runId: newRunId, workflowId: workflowIdString };
  },
});

export const listArtifacts = query({
  args: { threadId: v.string(), runId: v.optional(v.id("agentRuns")) },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    await assertThreadOwner(ctx, args.threadId);
    if (args.runId) {
      await assertRunOwner(ctx, args.runId, user._id);
      return await ctx.db
        .query("artifacts")
        .withIndex("by_owner_run", (q) =>
          q.eq("ownerUserId", user._id).eq("runId", args.runId),
        )
        .collect();
    }
    return await ctx.db
      .query("artifacts")
      .withIndex("by_owner_thread_created", (q) =>
        q.eq("ownerUserId", user._id).eq("threadId", args.threadId),
      )
      .order("desc")
      .take(50);
  },
});

export const getArtifact = query({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await ctx.db.get("artifacts", args.artifactId);
    if (!artifact || artifact.ownerUserId !== user._id) {
      return null;
    }
    const version = artifact.currentVersionId
      ? await ctx.db.get("artifactVersions", artifact.currentVersionId)
      : null;
    return { ...artifact, version };
  },
});

export const listCitationChecks = query({
  args: { artifactId: v.id("artifacts"), versionId: v.optional(v.id("artifactVersions")) },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const artifact = await ctx.db.get("artifacts", args.artifactId);
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
  handler: async (ctx, args): Promise<{ runId: Id<"agentRuns">; workflowId: string }> => {
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
    await ctx.db.patch("agentRuns", runId, { workflowId: workflowIdString, updatedAt: Date.now() });
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
        sourceStrategy: z.string(),
        reportIntent: z.string(),
        sufficiencyCriteria: z.array(z.string()).min(1).max(6),
        initialQueries: z.array(z.string()).min(1).max(5),
        maxRounds: z.number().int().min(1).max(3),
      }),
      prompt: [
        "Create a concise autonomous research plan for this prompt.",
        "The plan must include research questions, a source strategy, the intended report shape, concrete sufficiency criteria, and initial search queries.",
        "Keep maxRounds between 1 and 3. Prefer user corpus first, then public web discovery through Jina when corpus evidence is insufficient.",
        "",
        args.prompt,
      ].join("\n"),
    });
    const plan = normalizePlan(object.object);
    await ctx.runMutation(internal.agent.deepResearch.updateRunPlan, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      promptSnapshot: args.prompt,
      maxRounds: plan.maxRounds,
      budgetJson: JSON.stringify({
        maxRounds: plan.maxRounds,
        maxSources: MAX_SOURCES_PER_RUN,
        maxExtracts: MAX_EXTRACTS_PER_RUN,
        model: DEEP_MODEL,
        providers: ["convex_rag", "jina_search", "jina_reader", "jina_rerank"],
      }),
    });
    await ctx.runMutation(internal.agent.deepResearch.recordRunEvent, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      stepKey: "planResearch",
      eventType: "plan",
      title: plan.title,
      summary: plan.questions.join(" | "),
      metadataJson: JSON.stringify(plan),
    });
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "planResearch",
      status: "completed",
      summary: plan.title,
    });
    return plan;
  },
});

export const researchLoop = internalAction({
  args: { ...workflowArgs(), plan: v.any() },
  handler: async (ctx, args): Promise<{
    sources: SourceCandidate[];
    extracts: ResearchExtract[];
    roundState: ResearchRoundState[];
  }> => {
    const plan = normalizePlan(args.plan);
    const maxRounds = Math.min(plan.maxRounds || DEFAULT_MAX_ROUNDS, DEFAULT_MAX_ROUNDS);
    const sourcesByKey = new Map<string, Omit<SourceCandidate, "citationNumber">>();
    const extractsByKey = new Map<string, ResearchExtract>();
    const roundState: ResearchRoundState[] = [];
    let gapAssessment = `Initial plan: ${plan.sufficiencyCriteria.join("; ")}`;
    let sufficiencyStatus: SufficiencyStatus = "unknown";

    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "retrieveSources",
      status: "running",
    });

    for (let round = 1; round <= maxRounds; round += 1) {
      await ensureNotCanceled(ctx, args.runId);
      const query = await chooseNextQuery(ctx, {
        prompt: args.prompt,
        plan,
        round,
        previousSources: [...sourcesByKey.values()],
        previousExtracts: [...extractsByKey.values()],
        gapAssessment,
      });
      await ctx.runMutation(internal.agent.deepResearch.recordRunEvent, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        stepKey: "retrieveSources",
        eventType: "query",
        round,
        title: `Round ${round} query`,
        summary: query,
      });

      const corpus = await searchCorpus(ctx, args.ownerUserId, query);
      const externalNeeded = corpus.length < 4 || round > 1;
      const [arxiv, jina] = externalNeeded
        ? await Promise.all([
            searchArxivProvider(ctx, {
              ownerUserId: args.ownerUserId,
              query,
              limit: 4,
            }),
            jinaSearchWeb(ctx, {
              ownerUserId: args.ownerUserId,
              query,
              limit: 5,
            }),
          ])
        : [[], []];
      for (const source of dedupeSources([...corpus, ...arxiv, ...jina])) {
        if (sourcesByKey.size >= MAX_SOURCES_PER_RUN) {
          break;
        }
        sourcesByKey.set(sourceKey(source), source);
      }

      await ctx.runMutation(internal.agent.deepResearch.recordRunEvent, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        stepKey: "retrieveSources",
        eventType: "search",
        round,
        title: `Round ${round} discovery`,
        summary: summarizeSourceDiscovery({ corpus, arxiv, jina }),
        metadataJson: JSON.stringify({
          query,
          counts: {
            corpus: corpus.length,
            arxiv: arxiv.length,
            jina: jina.length,
          },
          sources: summarizeSourceMetadata([...corpus, ...arxiv, ...jina]),
        }),
      });

      await ctx.runMutation(internal.agent.deepResearch.markStep, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        stepKey: "retrieveSources",
        status: "completed",
        summary: `${sourcesByKey.size} sumber ditemukan`,
        sourceCount: sourcesByKey.size,
      });
      await ctx.runMutation(internal.agent.deepResearch.markStep, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        stepKey: "readExtract",
        status: "running",
      });

      const numberedSources = numberSources([...sourcesByKey.values()]);
      const selected = await selectSourcesToRead(ctx, args.ownerUserId, query, numberedSources);
      const extracts = await readAndExtract(ctx, {
        ownerUserId: args.ownerUserId,
        runId: args.runId,
        threadId: args.threadId,
        query,
        sources: selected,
      });
      for (const extract of extracts) {
        if (extractsByKey.size >= MAX_EXTRACTS_PER_RUN) {
          break;
        }
        extractsByKey.set(`${extract.sourceKey}:${extract.quote.slice(0, 80)}`, extract);
      }

      const assessment = await assessSufficiency(ctx, {
        prompt: args.prompt,
        plan,
        round,
        maxRounds,
        sources: numberSources([...sourcesByKey.values()]),
        extracts: [...extractsByKey.values()],
        previousGapAssessment: gapAssessment,
      });
      gapAssessment = assessment.gapAssessment;
      sufficiencyStatus = assessment.sufficiencyStatus;

      await ctx.runMutation(internal.agent.deepResearch.recordRunEvent, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        stepKey: "retrieveSources",
        eventType: "gap",
        round,
        title: `Round ${round} sufficiency`,
        summary: gapAssessment,
        metadataJson: JSON.stringify({ sufficiencyStatus }),
      });
      await ctx.runMutation(internal.agent.deepResearch.updateLoopProgress, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        roundCount: round,
        sufficiencyStatus,
      });

      const numberedAfterRead = numberSources([...sourcesByKey.values()]).map((source) => {
        const read = selected.find((item) => sourceKey(item) === sourceKey(source));
        return read ?? source;
      });
      roundState.push({
        round,
        query,
        gapAssessment,
        sufficiencyStatus,
        stopReason: sufficiencyStatus === "sufficient" ? "sufficient_evidence" : undefined,
        sources: numberedAfterRead,
        extracts: [...extractsByKey.values()],
      });
      await ctx.runMutation(internal.agent.deepResearch.markStep, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        stepKey: "readExtract",
        status: "completed",
        summary: `${extractsByKey.size} evidence extract siap dipakai`,
      });
      if (sufficiencyStatus === "sufficient") {
        break;
      }
    }

    if (sufficiencyStatus !== "sufficient" && roundState.length >= maxRounds) {
      sufficiencyStatus = "budget_exhausted";
      await ctx.runMutation(internal.agent.deepResearch.updateLoopProgress, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        roundCount: roundState.length,
        sufficiencyStatus,
      });
    }

    return {
      sources: numberSources([...sourcesByKey.values()]),
      extracts: [...extractsByKey.values()],
      roundState,
    };
  },
});

export const synthesize = internalAction({
  args: {
    ...workflowArgs(),
    plan: v.any(),
    sources: v.array(sourceRuntimeValidator()),
    extracts: v.any(),
    roundState: v.any(),
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
    const extractBlock = normalizeExtracts(args.extracts)
      .map((extract) => `[${extract.citationNumber}] ${extract.quote}`)
      .join("\n");
    const result = await generateText({
      model: openai.chat(DEEP_MODEL),
      system:
        "Write a source-grounded markdown research report. Cite every factual claim with persisted source numbers. Prefer accepted evidence extracts over snippets. If evidence is insufficient, keep that limitation visible and do not overstate certainty.",
      prompt: [
        `Prompt:\n${args.prompt}`,
        `Research plan:\n${JSON.stringify(normalizePlan(args.plan), null, 2)}`,
        `Round trace:\n${JSON.stringify(args.roundState, null, 2)}`,
        `Accepted evidence extracts:\n${extractBlock || "No extracted evidence beyond snippets."}`,
        `Sources:\n${sourceBlock}`,
      ].join("\n\n"),
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

export const summarizeResearchResponse = internalAction({
  args: {
    ...workflowArgs(),
    plan: v.any(),
    markdown: v.string(),
  },
  handler: async (ctx, args) => {
    await ensureNotCanceled(ctx, args.runId);
    const result = await generateText({
      model: openai.chat(DEEP_MODEL),
      system: [
        "Write the final chat response for a completed Deep Research run.",
        "The full report is already saved as an artifact, so this message should be a concise natural summary of the research.",
        "Do not force bullets, checklists, or a fixed template. Use natural paragraphs unless the content genuinely calls for a short list.",
        "Keep it user-friendly for a non-technical reader. Mention important uncertainty or caveats when they matter.",
        "Do not include implementation details about workflow, retries, tools, or database records.",
      ].join(" "),
      prompt: [
        `Original user prompt:\n${args.prompt}`,
        `Research plan:\n${JSON.stringify(normalizePlan(args.plan), null, 2)}`,
        `Final audited report:\n${trimForSnippet(args.markdown, 16_000)}`,
      ].join("\n\n"),
    });
    return result.text.trim() || buildPlainResponseSummary(args.markdown);
  },
});

export const auditClaims = internalAction({
  args: {
    ...workflowArgs(),
    sources: v.array(sourceRuntimeValidator()),
    extracts: v.any(),
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
    const checks = auditClaimsAgainstEvidence(args.markdown, args.sources, normalizeExtracts(args.extracts));
    const unsupported = checks.filter((check) => check.support === "unsupported");
    const markdown = unsupported.length > 0
      ? appendAuditCaveat(args.markdown, unsupported.map((check) => check.claim))
      : args.markdown;
    await ctx.runMutation(internal.agent.deepResearch.recordRunEvent, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      stepKey: "verifyCitations",
      eventType: "audit",
      title: "Claim audit",
      summary: `${checks.length} claims checked; ${unsupported.length} unsupported`,
      metadataJson: JSON.stringify({ cited: [...cited] }),
    });
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "verifyCitations",
      status: "completed",
      summary: `${checks.length} klaim diperiksa`,
    });
    return { markdown, checks };
  },
});

export const persistArtifact = internalMutation({
  args: {
    ...workflowArgs(),
    sources: v.array(sourceRuntimeValidator()),
    extracts: v.any(),
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
  handler: async (
    ctx,
    args,
  ): Promise<{
    primaryArtifactId: Id<"artifacts">;
    primaryVersionId?: Id<"artifactVersions">;
  }> => {
    const run = await assertRunOwner(ctx, args.runId, args.ownerUserId);
    if (run.status === "canceled") {
      return { primaryArtifactId: run.activeArtifactId as Id<"artifacts"> };
    }
    await markStepMutation(ctx, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "persistArtifact",
      status: "running",
    });
    const report: {
      artifactId: Id<"artifacts">;
      versionId: Id<"artifactVersions">;
    } = await ctx.runMutation(internal.agent.artifacts.createResearchReportFromRun, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      title: "Deep Research Report",
      markdown: args.markdown,
      changeSummary: "Initial Deep Research report",
    });
    const sourceIds = await persistSourcesForRun(ctx, {
      ...args,
      artifactId: report.artifactId,
      artifactVersionId: report.versionId,
    });
    await persistExtractsForRun(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      extracts: normalizeExtracts(args.extracts),
    });
    await persistCitationChecks(ctx, {
      ...args,
      artifactId: report.artifactId,
      artifactVersionId: report.versionId,
      sourceIdsByNumber: sourceIds,
    });
    const now = Date.now();
    await markStepMutation(ctx, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "persistArtifact",
      status: "completed",
      artifactCount: 1,
      summary: "Artefak tersimpan",
    });
    await ctx.db.patch("agentRuns", args.runId, {
      activeArtifactId: report.artifactId,
      artifactCount: 1,
      sourceCount: args.sources.length,
      citationCheckCount: args.checks.length,
      updatedAt: now,
    });
    return { primaryArtifactId: report.artifactId, primaryVersionId: report.versionId };
  },
});

export const finalizeThread = internalMutation({
  args: {
    ...workflowArgs(),
    artifactId: v.id("artifacts"),
    responseSummary: v.string(),
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
    const savedMessage = await ctx.runMutation(internal.agent.messages.saveAssistantMessage, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      promptMessageId: args.promptMessageId,
      content: args.responseSummary.trim(),
    });
    const artifact = await ctx.db.get("artifacts", args.artifactId);
    if (savedMessage.messageId && artifact?.currentVersionId) {
      await ctx.runMutation(internal.agent.artifacts.attachToMessage, {
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        messageId: savedMessage.messageId,
        artifactId: args.artifactId,
        versionId: artifact.currentVersionId,
        relation: "created",
      });
    }
    const now = Date.now();
    await markStepMutation(ctx, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "finalizeThread",
      status: "completed",
      summary: "Riset selesai",
    });
    await ctx.db.patch("agentRuns", args.runId, {
      status: "completed",
      currentStep: "finalizeThread",
      retryable: false,
      completedAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.agent.messages.generateThreadTitle, {
      threadId: args.threadId,
      userId: args.ownerUserId,
      prompt: run.promptSnapshot ?? "",
      assistantText: args.responseSummary,
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
    const runId = args.context?.runId as Id<"agentRuns"> | undefined;
    const ownerUserId = args.context?.ownerUserId as string | undefined;
    if (!runId || !ownerUserId) {
      return;
    }
    const run = await ctx.db.get("agentRuns", runId);
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
    runId: v.id("agentRuns"),
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

export const updateRunPlan = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    ownerUserId: v.string(),
    promptSnapshot: v.string(),
    maxRounds: v.number(),
    budgetJson: v.string(),
  },
  handler: async (ctx, args) => {
    await assertRunOwner(ctx, args.runId, args.ownerUserId);
    await ctx.db.patch("agentRuns", args.runId, {
      promptSnapshot: args.promptSnapshot,
      maxRounds: Math.min(Math.max(1, args.maxRounds), DEFAULT_MAX_ROUNDS),
      budgetJson: args.budgetJson,
      updatedAt: Date.now(),
    });
  },
});

export const updateLoopProgress = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    ownerUserId: v.string(),
    roundCount: v.number(),
    sufficiencyStatus: v.union(
      v.literal("unknown"),
      v.literal("insufficient"),
      v.literal("partial"),
      v.literal("sufficient"),
      v.literal("budget_exhausted"),
    ),
  },
  handler: async (ctx, args) => {
    await assertRunOwner(ctx, args.runId, args.ownerUserId);
    await ctx.db.patch("agentRuns", args.runId, {
      roundCount: args.roundCount,
      sufficiencyStatus: args.sufficiencyStatus,
      updatedAt: Date.now(),
    });
  },
});

export const recordRunEvent = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    ownerUserId: v.string(),
    threadId: v.string(),
    stepKey: v.optional(v.string()),
    eventType: v.union(
      v.literal("plan"),
      v.literal("gap"),
      v.literal("query"),
      v.literal("search"),
      v.literal("read"),
      v.literal("rerank"),
      v.literal("audit"),
      v.literal("tool"),
      v.literal("artifact"),
      v.literal("status"),
      v.literal("failure"),
    ),
    round: v.optional(v.number()),
    title: v.string(),
    summary: v.string(),
    metadataJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertRunOwner(ctx, args.runId, args.ownerUserId);
    await ctx.db.insert("agentRunEvents", {
      ownerUserId: args.ownerUserId,
      runId: args.runId,
      threadId: args.threadId,
      stepKey: args.stepKey,
      eventType: args.eventType,
      round: args.round,
      title: args.title,
      summary: trimForSnippet(args.summary, 1_500),
      metadataJson: args.metadataJson,
      createdAt: Date.now(),
    });
  },
});

async function createRun(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    promptMessageId: string;
    prompt?: string;
    retryOfRunId?: Id<"agentRuns">;
  },
) {
  const now = Date.now();
  const runId = await ctx.db.insert("agentRuns", {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    promptMessageId: args.promptMessageId,
    mode: "deep",
    executionKind: "workflow",
    promptSnapshot: args.prompt ?? "",
    status: "queued",
    roundCount: 0,
    maxRounds: DEFAULT_MAX_ROUNDS,
    sufficiencyStatus: "unknown",
    budgetJson: JSON.stringify({
      maxRounds: DEFAULT_MAX_ROUNDS,
      maxSources: MAX_SOURCES_PER_RUN,
      maxExtracts: MAX_EXTRACTS_PER_RUN,
    }),
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
      ctx.db.insert("agentRunSteps", {
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

async function listSteps(ctx: QueryCtx, ownerUserId: string, runId: Id<"agentRuns">) {
  return await ctx.db
    .query("agentRunSteps")
    .withIndex("by_owner_run", (q) => q.eq("ownerUserId", ownerUserId).eq("runId", runId))
    .collect();
}

async function listEvents(ctx: QueryCtx, ownerUserId: string, runId: Id<"agentRuns">) {
  return await ctx.db
    .query("agentRunEvents")
    .withIndex("by_owner_run_created", (q) => q.eq("ownerUserId", ownerUserId).eq("runId", runId))
    .collect();
}

async function assertRunOwner(ctx: QueryCtx | MutationCtx, runId: Id<"agentRuns">, ownerUserId: string) {
  const run = await ctx.db.get("agentRuns", runId);
  if (!run || run.ownerUserId !== ownerUserId) {
    throw new ConvexError("Run not found");
  }
  return run;
}

async function markStepMutation(
  ctx: MutationCtx,
  args: {
    runId: Id<"agentRuns">;
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
    .query("agentRunSteps")
    .withIndex("by_owner_run_and_step", (q) =>
      q.eq("ownerUserId", args.ownerUserId).eq("runId", args.runId).eq("stepKey", args.stepKey),
    )
    .unique();
  if (step) {
    await ctx.db.patch("agentRunSteps", step._id, {
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
  } else {
    await ctx.db.insert("agentRunSteps", {
      ownerUserId: args.ownerUserId,
      runId: args.runId,
      stepKey: args.stepKey,
      label: labelForStep(args.stepKey),
      order: orderForStep(args.stepKey),
      status: args.status,
      summary: args.summary,
      sourceCount: args.sourceCount,
      artifactCount: args.artifactCount,
      failureReason: args.failureReason,
      startedAt: args.status === "running" ? now : undefined,
      completedAt:
        args.status === "completed" || args.status === "failed" || args.status === "canceled"
          ? now
          : undefined,
      updatedAt: now,
    });
  }
  if (args.status === "running") {
    await ctx.db.patch("agentRuns", args.runId, {
      status: "running",
      currentStep: args.stepKey,
      updatedAt: now,
    });
  }
}

function labelForStep(stepKey: string) {
  return stepDefinitions.find(([key]) => key === stepKey)?.[1] ?? stepKey;
}

function orderForStep(stepKey: string) {
  const index = stepDefinitions.findIndex(([key]) => key === stepKey);
  return index >= 0 ? index : 100;
}

function estimateTokens(content: string) {
  return Math.max(1, Math.ceil(content.length / 4));
}

async function markCanceled(ctx: MutationCtx, runId: Id<"agentRuns">, ownerUserId: string) {
  const now = Date.now();
  await ctx.db.patch("agentRuns", runId, {
    status: "canceled",
    canceledAt: now,
    retryable: false,
    updatedAt: now,
  });
  const steps = await ctx.db
    .query("agentRunSteps")
    .withIndex("by_owner_run", (q) => q.eq("ownerUserId", ownerUserId).eq("runId", runId))
    .collect();
  await Promise.all(
    steps
      .filter((step) => step.status === "pending" || step.status === "running")
      .map((step) =>
        ctx.db.patch("agentRunSteps", step._id, { status: "canceled", completedAt: now, updatedAt: now }),
      ),
  );
}

async function failRun(
  ctx: MutationCtx,
  args: {
    runId: Id<"agentRuns">;
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
  await ctx.db.patch("agentRuns", args.runId, {
    status: "failed",
    failedStep: args.stepKey,
    retryable: true,
    errorCode: args.code,
    errorMessage: args.message,
    updatedAt: Date.now(),
  });
}

async function ensureNotCanceled(
  ctx: { runQuery: (ref: typeof internal.agent.deepResearch.getInternalRun, args: { runId: Id<"agentRuns"> }) => Promise<{ status: string } | null> },
  runId: Id<"agentRuns">,
) {
  const run = await ctx.runQuery(internal.agent.deepResearch.getInternalRun, { runId });
  if (run?.status === "canceled") {
    throw new ConvexError("Run canceled");
  }
}

export const getInternalRun = internalQuery({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => await ctx.db.get("agentRuns", args.runId),
});

async function readPromptMessage(_ctx: MutationCtx, messageId: string) {
  return `Retry deep research for message ${messageId}`;
}

function workflowArgs() {
  return {
    runId: v.id("agentRuns"),
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
    provider: v.optional(v.string()),
    providerRequestId: v.optional(v.string()),
    evidenceStrength: v.union(v.literal("strong"), v.literal("medium"), v.literal("weak")),
    title: v.string(),
    locator: v.string(),
    url: v.optional(v.string()),
    doi: v.optional(v.string()),
    arxivId: v.optional(v.string()),
    snippet: v.string(),
    readStatus: v.optional(v.union(v.literal("not_needed"), v.literal("ready"), v.literal("failed"))),
    readError: v.optional(v.string()),
    rerankScore: v.optional(v.number()),
    metadataJson: v.optional(v.string()),
    corpusSourceId: v.optional(v.id("corpusSources")),
  });
}

function normalizePlan(value: unknown): ResearchPlan {
  const plan = isRecord(value) ? value : {};
  return {
    title: stringValue(plan.title) || "Deep Research Report",
    questions: stringArray(plan.questions).slice(0, 5),
    sourceStrategy: stringValue(plan.sourceStrategy) || "Search the user corpus first, then use Jina web discovery for gaps.",
    reportIntent: stringValue(plan.reportIntent) || "Produce a cited research report.",
    sufficiencyCriteria: stringArray(plan.sufficiencyCriteria).slice(0, 6),
    initialQueries: stringArray(plan.initialQueries).slice(0, 5),
    maxRounds: clampRoundCount(numberValue(plan.maxRounds) ?? DEFAULT_MAX_ROUNDS),
  };
}

async function chooseNextQuery(
  _ctx: ActionCtx,
  args: {
    prompt: string;
    plan: ResearchPlan;
    round: number;
    previousSources: Array<Omit<SourceCandidate, "citationNumber">>;
    previousExtracts: ResearchExtract[];
    gapAssessment: string;
  },
) {
  if (args.round === 1) {
    return args.plan.initialQueries[0] || args.prompt;
  }
  const object = await generateObject({
    model: openai.chat(DEEP_MODEL),
    schema: z.object({
      query: z.string().min(1).max(500),
      rationale: z.string(),
    }),
    prompt: [
      "Choose one next research query based on evidence gaps. Do not repeat earlier broad queries.",
      `Prompt: ${args.prompt}`,
      `Plan: ${JSON.stringify(args.plan)}`,
      `Previous source titles: ${args.previousSources.map((source) => source.title).join("; ")}`,
      `Previous extracts: ${args.previousExtracts.map((extract) => extract.quote).join("\n")}`,
      `Gap assessment: ${args.gapAssessment}`,
    ].join("\n\n"),
  });
  return object.object.query.trim() || args.prompt;
}

async function searchCorpus(ctx: ActionCtx, ownerUserId: string, query: string) {
  const result = await corpusRag.search(ctx, {
    namespace: userNamespace(ownerUserId),
    query,
    limit: 5,
    vectorScoreThreshold: 0.35,
  });
  return result.entries.map((entry) => ({
    origin: "corpus" as const,
    provider: "convex_rag",
    readStatus: "not_needed" as const,
    evidenceStrength: "strong" as const,
    title: entry.metadata?.title ?? entry.title ?? "Corpus source",
    locator: entry.metadata?.locator ?? entry.entryId,
    url: entry.metadata?.url,
    doi: entry.metadata?.doi,
    arxivId: entry.metadata?.arxivId,
    snippet: trimForSnippet(entry.text || result.text || "Corpus match", 1_500),
    corpusSourceId: entry.metadata?.corpusSourceId as Id<"corpusSources"> | undefined,
  }));
}

async function selectSourcesToRead(
  ctx: ActionCtx,
  ownerUserId: string,
  query: string,
  sources: SourceCandidate[],
) {
  const documents = sources.map((source) => ({
    sourceKey: sourceKey(source),
    title: source.title,
    text: source.snippet,
  }));
  const reranked = await jinaRerank(ctx, {
    ownerUserId,
    query,
    documents,
    topN: Math.min(6, documents.length),
  });
  const byKey = new Map(sources.map((source) => [sourceKey(source), source]));
  return reranked
    .map((ranked): SourceCandidate | null => {
      const source = byKey.get(ranked.sourceKey);
      return source ? { ...source, rerankScore: ranked.score } : null;
    })
    .filter((source): source is SourceCandidate => Boolean(source));
}

async function readAndExtract(
  ctx: ActionCtx,
  args: {
    ownerUserId: string;
    runId: Id<"agentRuns">;
    threadId: string;
    query: string;
    sources: SourceCandidate[];
  },
) {
  const extracts: ResearchExtract[] = [];
  for (const source of args.sources) {
    const key = sourceKey(source);
    const read =
      source.url && source.origin !== "corpus"
        ? await jinaReadUrl(ctx, { ownerUserId: args.ownerUserId, url: source.url })
        : {
            ok: true,
            title: source.title,
            url: source.url ?? source.locator,
            markdown: source.snippet,
            snippet: source.snippet,
          };
    const text = read.ok ? read.markdown || read.snippet : source.snippet;
    const quote = trimForSnippet(text, 1_400);
    extracts.push({
      sourceKey: key,
      citationNumber: source.citationNumber,
      title: read.title || source.title,
      locator: source.url ?? source.locator,
      quote,
      relevance: source.rerankScore && source.rerankScore > 0.6 ? "high" : "medium",
      notes: read.ok ? undefined : read.failureReason,
      rerankScore: source.rerankScore,
    });
    await ctx.runMutation(internal.agent.deepResearch.recordRunEvent, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      stepKey: "readExtract",
      eventType: "read",
      title: read.title || source.title,
      summary: read.ok ? trimForSnippet(quote, 300) : `Read failed: ${read.failureReason}`,
      metadataJson: JSON.stringify({ sourceKey: key, url: source.url, ok: read.ok }),
    });
  }
  return extracts;
}

async function assessSufficiency(
  _ctx: unknown,
  args: {
    prompt: string;
    plan: ResearchPlan;
    round: number;
    maxRounds: number;
    sources: SourceCandidate[];
    extracts: ResearchExtract[];
    previousGapAssessment: string;
  },
) {
  if (args.extracts.length < 3 && args.round < args.maxRounds) {
    return {
      sufficiencyStatus: "insufficient" as const,
      gapAssessment: "Need more evidence extracts before synthesis.",
    };
  }
  const object = await generateObject({
    model: openai.chat(DEEP_MODEL),
    schema: z.object({
      sufficiencyStatus: z.enum(["insufficient", "partial", "sufficient"]),
      gapAssessment: z.string(),
    }),
    prompt: [
      "Assess whether the evidence is sufficient to write a useful report. Consider bias, contradictions, and missing angles.",
      `Prompt: ${args.prompt}`,
      `Criteria: ${args.plan.sufficiencyCriteria.join("; ")}`,
      `Previous assessment: ${args.previousGapAssessment}`,
      `Sources: ${args.sources.map((source) => `[${source.citationNumber}] ${source.title}: ${source.snippet}`).join("\n")}`,
      `Extracts: ${args.extracts.map((extract) => `[${extract.citationNumber}] ${extract.quote}`).join("\n")}`,
    ].join("\n\n"),
  });
  return {
    sufficiencyStatus: object.object.sufficiencyStatus,
    gapAssessment: object.object.gapAssessment,
  };
}

function dedupeSources(sources: Array<Omit<SourceCandidate, "citationNumber">>) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = sourceKey(source);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sourceKey(source: Pick<SourceCandidate, "doi" | "arxivId" | "url" | "locator" | "title">) {
  return (source.doi ?? source.arxivId ?? source.url ?? source.locator ?? source.title).toLowerCase();
}

function numberSources(sources: Array<Omit<SourceCandidate, "citationNumber">>): SourceCandidate[] {
  return sources.slice(0, MAX_SOURCES_PER_RUN).map((source, index) => ({
    ...source,
    citationNumber: index + 1,
  }));
}

function summarizeSourceDiscovery(args: {
  corpus: Array<Omit<SourceCandidate, "citationNumber">>;
  arxiv: Array<Omit<SourceCandidate, "citationNumber">>;
  jina: Array<Omit<SourceCandidate, "citationNumber">>;
}) {
  const groups = [
    sourceGroupSummary("corpus", args.corpus),
    sourceGroupSummary("arXiv", args.arxiv),
    sourceGroupSummary("Jina", args.jina),
  ].filter(Boolean);
  return groups.length > 0 ? groups.join(" | ") : "Tidak ada sumber baru ditemukan";
}

function sourceGroupSummary(
  label: string,
  sources: Array<Pick<SourceCandidate, "title" | "url" | "locator">>,
) {
  if (sources.length === 0) {
    return null;
  }
  const titles = sources
    .slice(0, 3)
    .map((source) => source.title || source.url || source.locator)
    .filter(Boolean)
    .join("; ");
  return `${label}: ${titles}`;
}

function summarizeSourceMetadata(sources: Array<Omit<SourceCandidate, "citationNumber">>) {
  return sources.slice(0, MAX_SOURCES_PER_RUN).map((source) => ({
    origin: source.origin,
    provider: source.provider,
    title: source.title,
    url: source.url,
    locator: source.locator,
  }));
}

function normalizeExtracts(value: unknown): ResearchExtract[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const quote = stringValue(item.quote);
    const title = stringValue(item.title);
    const locator = stringValue(item.locator);
    const sourceKeyValue = stringValue(item.sourceKey);
    const citationNumber = numberValue(item.citationNumber);
    if (!quote || !title || !locator || !sourceKeyValue || citationNumber === undefined) {
      return [];
    }
    return [
      {
        sourceKey: sourceKeyValue,
        citationNumber,
        title,
        locator,
        quote,
        relevance:
          item.relevance === "high" || item.relevance === "low" ? item.relevance : "medium",
        notes: stringValue(item.notes),
        rerankScore: numberValue(item.rerankScore),
      },
    ];
  });
}

function auditClaimsAgainstEvidence(
  markdown: string,
  sources: SourceCandidate[],
  extracts: ResearchExtract[],
) {
  const sourceNumbers = new Set(sources.map((source) => source.citationNumber));
  return splitClaims(markdown).slice(0, 16).map((claim) => {
    const claimCitations = [...extractCitationNumbers(claim)].filter((number) => sourceNumbers.has(number));
    const relevantEvidence = extracts.filter((extract) =>
      claimCitations.includes(extract.citationNumber),
    );
    const support: "supported" | "partial" | "unsupported" =
      claimCitations.length === 0
        ? "unsupported"
        : relevantEvidence.length > 0
          ? "supported"
          : "partial";
    return {
      claim,
      support,
      citationNumbers: claimCitations,
      evidence: relevantEvidence.map((extract) => extract.quote).join("\n") || evidenceText(support),
    };
  });
}

function appendAuditCaveat(markdown: string, unsupportedClaims: string[]) {
  if (unsupportedClaims.length === 0) {
    return markdown;
  }
  const caveat = [
    "",
    "## Audit Notes",
    "The following claims were not fully supported by accepted evidence and should be treated as caveated:",
    ...unsupportedClaims.slice(0, 6).map((claim) => `- ${claim}`),
  ].join("\n");
  return `${markdown.trim()}\n${caveat}`;
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

function buildPlainResponseSummary(markdown: string) {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "Ringkasan riset";
  const sentences = markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[>*_`|]/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 40)
    .slice(0, 3);

  return [`## ${title}`, "", sentences.join(" ")].join("\n").trim();
}

function evidenceText(support: "supported" | "partial" | "unsupported") {
  if (support === "supported") {
    return "Claim has matching accepted evidence.";
  }
  if (support === "partial") {
    return "Claim has persisted citation markers but no accepted extract match.";
  }
  return "No persisted citation marker found for this claim.";
}

function isWorkflowAlreadyStoppedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /Workflow not running|already (completed|canceled|failed)|not found/i.test(message);
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampRoundCount(value: number) {
  return Math.min(Math.max(1, Math.floor(value)), DEFAULT_MAX_ROUNDS);
}

async function persistSourcesForRun(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    runId: Id<"agentRuns">;
    artifactId?: Id<"artifacts">;
    artifactVersionId?: Id<"artifactVersions">;
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
      artifactId: args.artifactId,
      artifactVersionId: args.artifactVersionId,
      citationNumber: source.citationNumber,
      origin: source.origin,
      provider: source.provider,
      providerRequestId: source.providerRequestId,
      evidenceStrength: source.evidenceStrength,
      title: source.title,
      locator: source.locator,
      url: source.url,
      doi: source.doi,
      arxivId: source.arxivId,
      snippet: source.snippet,
      readStatus: source.readStatus,
      readError: source.readError,
      rerankScore: source.rerankScore,
      metadataJson: source.metadataJson,
      corpusSourceId: source.corpusSourceId,
      createdAt: now,
    });
    ids.set(source.citationNumber, sourceId);
  }
  return ids;
}

async function persistExtractsForRun(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    runId: Id<"agentRuns">;
    extracts: ResearchExtract[];
  },
) {
  const now = Date.now();
  await Promise.all(
    args.extracts.slice(0, MAX_EXTRACTS_PER_RUN).map((extract) =>
      ctx.db.insert("researchExtracts", {
        ownerUserId: args.ownerUserId,
        runId: args.runId,
        threadId: args.threadId,
        sourceKey: extract.sourceKey,
        citationNumber: extract.citationNumber,
        title: extract.title,
        locator: extract.locator,
        quote: extract.quote,
        relevance: extract.relevance,
        notes: extract.notes,
        createdAt: now,
      }),
    ),
  );
}

async function persistCitationChecks(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    runId: Id<"agentRuns">;
    artifactId: Id<"artifacts">;
    artifactVersionId: Id<"artifactVersions">;
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
        artifactVersionId: args.artifactVersionId,
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
