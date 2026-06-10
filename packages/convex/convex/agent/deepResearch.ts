import { generateObject, generateText, Output } from "ai";
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
  jinaRerank,
  lookupDoiProvider,
  readWithExaContents,
  readWithJinaReader,
  searchArxivProvider,
  searchExaCandidates,
  searchJinaCandidates,
} from "./externalProviders";
import { sourceCandidateValidator, trimForSnippet, type SourceCandidate } from "./sourceCandidates";
import {
  assessSourceQuality,
  canonicalSourceKey,
  sourceDomain,
  type SourceQuality,
} from "./sourceQuality";
import { assertThreadOwner, tryAssertThreadOwner } from "./threads";
import { researchWorkflow } from "./workflow";
import { CHAT_PROVIDER_NAME, chatProvider } from "./providers";
import { markThreadStatusAfterTerminalRun } from "./runLifecycle";
import type { AgentKind } from "./runtime";
import { DEEP_LITE_MODEL, deepModelForAgent } from "./models";

const agentKindValidator = v.union(v.literal("lite"), v.literal("pro"));

// Deep Research is modulated by the selected agent. Astra Lite runs the lite
// model for every task with a tight round cap; Astra Pro uses the heavier deep
// model for planning/synthesis and a larger round cap. Legacy/in-flight runs
// without an agentKind behave like Pro (the previous default).
function roundCapForAgent(agentKind: AgentKind | undefined) {
  return (agentKind ?? "pro") === "pro" ? 4 : 2;
}
const MAX_SOURCES_PER_RUN = 14;
const MAX_EXTRACTS_PER_RUN = 24;
const DISCOVERY_TARGET_PER_RUN = 60;
const MIN_ACCEPTED_SOURCES = 10;
const MIN_ACCEPTED_EXTRACTS = 8;
const PER_DOMAIN_ACCEPTED_CAP = 2;
const MIN_BUCKET_COVERAGE = 3;
const MIN_DOMAIN_DIVERSITY = 4;
const ACTION_RETRY = { maxAttempts: 3, initialBackoffMs: 2_000, base: 2 };

type SufficiencyStatus =
  | "unknown"
  | "insufficient"
  | "partial"
  | "sufficient"
  | "budget_exhausted";

type VerificationStatus =
  | "not_started"
  | "checking"
  | "passed"
  | "revised"
  | "partial"
  | "failed";

type ResearchPlan = {
  title: string;
  questions: string[];
  sourceStrategy: string;
  reportIntent: string;
  sufficiencyCriteria: string[];
  initialQueries: string[];
  maxRounds: number;
};

export type ResearchExtract = {
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

type CitationSupport = "supported" | "partially_supported" | "contradicted" | "partial" | "unsupported";

type CitationCheckDraft = {
  claim: string;
  support: CitationSupport;
  citationNumbers: number[];
  evidence: string;
  verifierModel?: string;
  confidence?: number;
  failureReason?: string;
  extractKeys?: string[];
  revisionAction?: "none" | "caveated" | "removed_or_rewritten";
};

type SourceBucket = {
  name: string;
  queries: string[];
  preferredProviders: Array<"exa" | "jina" | "arxiv" | "crossref">;
  includeDomains?: string[];
  excludeDomains?: string[];
  freshnessTarget?: "any" | "recent" | "current";
  minAcceptedSources: number;
};

export type DiscoveryCandidate = Omit<SourceCandidate, "citationNumber"> & {
  bucketName?: string;
  discoveryQuery?: string;
};

export type ReadAttempt = {
  provider: "exa" | "jina" | "none";
  ok: boolean;
  title: string;
  url: string;
  text: string;
  snippet: string;
  failureReason?: string;
};

type AcceptedSource = {
  source: Omit<SourceCandidate, "citationNumber">;
  extract: ResearchExtract;
  quality: SourceQuality;
  readAttempts: ReadAttempt[];
};

type RejectedSource = {
  source: Omit<SourceCandidate, "citationNumber">;
  reason: SourceQuality["reason"] | "domain_cap" | "domain_penalized" | "duplicate";
  readAttempts?: ReadAttempt[];
};

type EvidenceReadiness = {
  ready: boolean;
  status: "insufficient" | "partial" | "sufficient";
  readableSourceCount: number;
  extractCount: number;
  domainCount: number;
  bucketCount: number;
  highQualityExtractCount: number;
  missing: string[];
  recommendation: string;
};

const stepDefinitions = [
  ["planRound", "Merencanakan ronde"],
  ["discoverRoundCandidates", "Mencari sumber"],
  ["rerankRoundCandidates", "Mengurutkan kandidat"],
  ["readRoundSources", "Membaca sumber"],
  ["assessRoundSufficiency", "Menilai kecukupan evidence"],
  ["runCounterEvidencePass", "Menguji counter-evidence"],
  ["synthesize", "Menyusun laporan"],
  ["verifyClaimsSemantically", "Memverifikasi klaim"],
  ["reviseUnsupportedClaims", "Merevisi klaim lemah"],
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

export const deepResearchExecuteWorkflow = researchWorkflow.define({
  args: {
    runId: v.id("agentRuns"),
    ownerUserId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
    prompt: v.string(),
    plan: v.any(),
    agentKind: v.optional(agentKindValidator),
  },
  handler: async (step, args): Promise<void> => {
    const plan = normalizePlan(args.plan, args.agentKind);
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

    const isSimpleTopic = (plan.maxRounds ?? 1) === 1 && (plan.sufficiencyCriteria?.length ?? 0) <= 2;
    let finalMarkdown = synthesis.markdown;
    let checks: Array<{
      claim: string;
      support: "supported" | "partially_supported" | "contradicted" | "partial" | "unsupported";
      citationNumbers: number[];
      evidence: string;
      verifierModel?: string;
      confidence?: number;
      failureReason?: string;
      extractKeys?: string[];
      revisionAction?: "none" | "caveated" | "removed_or_rewritten";
    }> = [];

    if (!isSimpleTopic) {
      const audit = await step.runAction(internal.agent.deepResearch.auditClaims, {
        ...args,
        sources: loop.sources,
        extracts: loop.extracts,
        markdown: synthesis.markdown,
      }, {
        retry: ACTION_RETRY,
      });
      finalMarkdown = audit.markdown;
      checks = audit.checks;
    }

    const persisted = await step.runMutation(internal.agent.deepResearch.persistArtifact, {
      ...args,
      sources: loop.sources,
      extracts: loop.extracts,
      markdown: finalMarkdown,
      checks,
    });
    await step.runMutation(internal.agent.deepResearch.finalizeThread, {
      ...args,
      artifactId: persisted.primaryArtifactId,
      responseSummary: synthesis.chatSummary,
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
    if (!(await tryAssertThreadOwner(ctx, args.threadId))) {
      return [];
    }
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
    const canRetryPartial =
      run.status === "completed" &&
      run.retryable &&
      (run.sufficiencyStatus === "partial" || run.sufficiencyStatus === "budget_exhausted");
    if (!canRetryPartial && (run.status !== "failed" || !run.retryable)) {
      throw new ConvexError("Run is not retryable");
    }
    const prompt = run.promptSnapshot || await readPromptMessage(ctx, run.promptMessageId);
    // Legacy deep runs have no agentKind; treat them as Pro (the old default).
    const agentKind: AgentKind = run.agentKind ?? "pro";
    const billing = await consumeCredits(ctx, {
      ownerUserId: user._id,
      ownerEmail: user.email,
      threadId: run.threadId,
      feature: "deep_research",
      provider: CHAT_PROVIDER_NAME,
      model: deepModelForAgent(agentKind),
      inputTokens: estimateTokens(prompt),
      totalTokens: estimateTokens(prompt),
      credits: estimateCredits({
        feature: "deep_research",
        inputTokens: estimateTokens(prompt),
        totalTokens: estimateTokens(prompt),
        agentKind,
      }),
      requiredPlan: agentKind === "pro" ? "starter" : "free",
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
      agentKind,
    });
    await ctx.scheduler.runAfter(0, internal.agent.messages.generateDeepPlan, {
      threadId: run.threadId,
      userId: user._id,
      promptMessageId: run.promptMessageId,
      prompt,
      runId: newRunId,
      agentKind,
    });
    return { ok: true as const, runId: newRunId, workflowId: "" };
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
      .take(200);
  },
});

export const startForMessage = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
    prompt: v.string(),
    commandId: v.optional(v.string()),
    agentKind: agentKindValidator,
  },
  handler: async (ctx, args): Promise<{ runId: Id<"agentRuns"> }> => {
    const runId = await createRun(ctx, args);
    // Deep research is now native: the model proposes the research plan via the
    // startDeepResearch tool (needsApproval) in an inline planning generation,
    // and the tool starts deepResearchExecuteWorkflow on approval.
    await ctx.scheduler.runAfter(0, internal.agent.messages.generateDeepPlan, {
      threadId: args.threadId,
      userId: args.ownerUserId,
      promptMessageId: args.promptMessageId,
      prompt: args.prompt,
      runId,
      agentKind: args.agentKind,
    });
    return { runId };
  },
});

// Start the durable research workflow from a model-proposed, user-approved plan
// (called by the startDeepResearch tool's execute on approval). No hitlSessions
// involvement — the run is completed by handleWorkflowComplete.
export const startExecuteFromPlan = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    ownerUserId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
    plan: v.any(),
  },
  handler: async (ctx, args): Promise<{ workflowId: string }> => {
    const run = await ctx.db.get("agentRuns", args.runId);
    if (!run || run.ownerUserId !== args.ownerUserId) {
      throw new ConvexError("Run not found");
    }
    const prompt =
      run.promptSnapshot || (await readPromptMessage(ctx, run.promptMessageId)) || "";
    const agentKind: AgentKind = run.agentKind ?? "pro";
    const plan = normalizePlan(args.plan, agentKind);
    const workflowId = await researchWorkflow.start(
      ctx,
      internal.agent.deepResearch.deepResearchExecuteWorkflow,
      {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        promptMessageId: args.promptMessageId,
        prompt,
        plan,
        agentKind,
      },
      {
        onComplete: internal.agent.deepResearch.handleWorkflowComplete,
        context: { runId: args.runId, ownerUserId: args.ownerUserId },
      },
    );
    await ctx.db.patch("agentRuns", args.runId, {
      workflowId: String(workflowId),
      status: "running",
      updatedAt: Date.now(),
    });
    return { workflowId: String(workflowId) };
  },
});

export const planResearch = internalAction({
  args: workflowArgs(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "planRound",
      status: "running",
    });
    const maxRoundCap = roundCapForAgent(args.agentKind);
    const object = await generateObject({
      model: chatProvider.chat(deepModelForAgent(args.agentKind)),
      schema: z.object({
        title: z.string(),
        questions: z.array(z.string()).min(1).max(5),
        sourceStrategy: z.string(),
        reportIntent: z.string(),
        sufficiencyCriteria: z.array(z.string()).min(1).max(6),
        initialQueries: z.array(z.string()).min(1).max(5),
        maxRounds: z.number().int().min(1).max(maxRoundCap),
      }),
      prompt: [
        "Create a concise autonomous research plan for this prompt.",
        "The plan must include research questions, a source strategy, the intended report shape, concrete sufficiency criteria, and initial search queries.",
        `Keep maxRounds between 1 and ${maxRoundCap}. Describe the evidence mix needed; the server will safely execute academic and web providers.`,
        "",
        args.prompt,
      ].join("\n"),
    });
    const plan = normalizePlan(object.object, args.agentKind);
    await ctx.runMutation(internal.agent.deepResearch.updateRunPlan, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      promptSnapshot: args.prompt,
      maxRounds: plan.maxRounds,
      agentKind: args.agentKind,
      budgetJson: JSON.stringify({
        maxRounds: plan.maxRounds,
        maxSources: MAX_SOURCES_PER_RUN,
        maxExtracts: MAX_EXTRACTS_PER_RUN,
        model: deepModelForAgent(args.agentKind),
        providers: ["exa_search", "exa_contents", "jina_search", "jina_reader", "jina_rerank", "arxiv", "crossref"],
      }),
    });
    await ctx.runMutation(internal.agent.deepResearch.recordRunEvent, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      stepKey: "planRound",
      eventType: "plan",
      title: plan.title,
      summary: plan.questions.join(" | "),
      metadataJson: JSON.stringify(plan),
    });
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "planRound",
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
    const plan = normalizePlan(args.plan, args.agentKind);
    const roundCap = roundCapForAgent(args.agentKind);
    const maxRounds = Math.min(plan.maxRounds || roundCap, roundCap);
    const candidatePool = new Map<string, DiscoveryCandidate>();
    const acceptedByKey = new Map<string, AcceptedSource>();
    const extractsByKey = new Map<string, ResearchExtract>();
    const rejected: RejectedSource[] = [];
    const domainPenalties = new Map<string, number>();
    const roundState: ResearchRoundState[] = [];
    const buckets = await planSourceBuckets(ctx, args.prompt, plan);
    let gapAssessment = `Initial plan: ${plan.sufficiencyCriteria.join("; ")}`;
    let sufficiencyStatus: SufficiencyStatus = "unknown";

    for (let round = 1; round <= maxRounds; round += 1) {
      await ensureNotCanceled(ctx, args.runId);
      const queries = await chooseRoundQueries(ctx, {
        prompt: args.prompt,
        plan,
        buckets,
        round,
        previousSources: [...acceptedByKey.values()].map((item) => item.source),
        previousExtracts: [...extractsByKey.values()],
        gapAssessment,
        rejected,
      });
      await ctx.runMutation(internal.agent.deepResearch.recordRunEvent, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        stepKey: "planRound",
        eventType: "query",
        round,
        title: `Round ${round} queries`,
        summary: queries.map((item) => `${item.bucket.name}: ${item.query}`).join(" | "),
        metadataJson: JSON.stringify({
          queries: queries.map((item) => ({
            bucket: item.bucket.name,
            query: item.query,
            providers: item.bucket.preferredProviders,
          })),
          gapAssessment,
        }),
      });
      await ctx.runMutation(internal.agent.deepResearch.recordRoundState, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        round,
        status: "planned",
        query: queries.map((item) => item.query).join(" | "),
        gapAssessment,
        sufficiencyStatus,
        sourceCount: acceptedByKey.size,
        extractCount: extractsByKey.size,
        stateJson: JSON.stringify({ queries }),
      });
      await ctx.runMutation(internal.agent.deepResearch.markStep, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        stepKey: "discoverRoundCandidates",
        status: "running",
      });

      const discovery = await discoverCandidates(ctx, {
        ownerUserId: args.ownerUserId,
        queries,
        excludedDomains: [...domainPenalties.entries()]
          .filter(([, count]) => count >= 1)
          .map(([domain]) => domain),
      });
      await ctx.runMutation(internal.agent.sources.upsertRunCandidates, {
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        runId: args.runId,
        usage: "candidate",
        candidates: discovery.candidates.map((source) =>
          sourceForStorage(source, "candidate"),
        ),
      });
      mergeCandidatePool(candidatePool, discovery.candidates, {
        acceptedKeys: new Set(acceptedByKey.keys()),
        rejectedKeys: new Set(rejected.map((item) => sourceKey(item.source))),
      });

      await ctx.runMutation(internal.agent.deepResearch.recordRunEvent, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        stepKey: "discoverRoundCandidates",
        eventType: "search",
        round,
        title: `Round ${round} discovery`,
        summary: summarizeSourceDiscovery(discovery.byProvider),
        metadataJson: JSON.stringify({
          counts: discovery.counts,
          poolSize: candidatePool.size,
          newCandidateCount: discovery.candidates.filter((source) => candidatePool.has(sourceKey(source))).length,
          sources: summarizeSourceMetadata(discovery.candidates),
          domainPenalties: Object.fromEntries(domainPenalties),
        }),
      });

      await ctx.runMutation(internal.agent.deepResearch.markStep, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        stepKey: "discoverRoundCandidates",
        status: "completed",
        summary: `${candidatePool.size} kandidat ditemukan`,
        sourceCount: candidatePool.size,
      });
      await ctx.runMutation(internal.agent.deepResearch.markStep, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        stepKey: "rerankRoundCandidates",
        status: "running",
      });

      const selected = await selectCandidatesToValidate(ctx, {
        ownerUserId: args.ownerUserId,
        query: queries.map((item) => item.query).join("\n"),
        candidates: [...candidatePool.values()],
        acceptedKeys: new Set(acceptedByKey.keys()),
        rejectedKeys: new Set(rejected.map((item) => sourceKey(item.source))),
      });
      await ctx.runMutation(internal.agent.deepResearch.markStep, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        stepKey: "rerankRoundCandidates",
        status: "completed",
        summary: `${selected.length} kandidat prioritas`,
        sourceCount: selected.length,
      });
      await ctx.runMutation(internal.agent.deepResearch.markStep, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        stepKey: "readRoundSources",
        status: "running",
      });
      const validation = await validateAndRead(ctx, {
        ownerUserId: args.ownerUserId,
        runId: args.runId,
        threadId: args.threadId,
        candidates: selected,
        acceptedByDomain: acceptedDomainCounts([...acceptedByKey.values()].map((item) => item.source)),
        domainPenalties,
      });
      await recordValidationSources(ctx, {
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        runId: args.runId,
        accepted: validation.accepted,
        rejected: validation.rejected,
      });
      for (const item of validation.accepted) {
        acceptedByKey.set(sourceKey(item.source), item);
        const extract = item.extract;
        if (extractsByKey.size >= MAX_EXTRACTS_PER_RUN) {
          break;
        }
        extractsByKey.set(`${extract.sourceKey}:${extract.quote.slice(0, 80)}`, extract);
      }
      rejected.push(...validation.rejected);
      pruneResolvedCandidates(candidatePool, {
        acceptedKeys: new Set(acceptedByKey.keys()),
        rejectedKeys: new Set(rejected.map((item) => sourceKey(item.source))),
      });
      await ctx.runMutation(internal.agent.deepResearch.markStep, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        stepKey: "readRoundSources",
        status: "completed",
        summary: `${validation.accepted.length} sumber readable, ${validation.rejected.length} ditolak`,
        sourceCount: acceptedByKey.size,
      });
      await ctx.runMutation(internal.agent.deepResearch.markStep, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        stepKey: "assessRoundSufficiency",
        status: "running",
      });

      const assessment = await assessSufficiency(ctx, {
        prompt: args.prompt,
        plan,
        round,
        maxRounds,
        sources: numberSources([...acceptedByKey.values()].map((item) => item.source)),
        extracts: [...extractsByKey.values()],
        previousGapAssessment: gapAssessment,
      });
      gapAssessment = assessment.gapAssessment;
      sufficiencyStatus = assessment.sufficiencyStatus;

      await ctx.runMutation(internal.agent.deepResearch.recordRunEvent, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        stepKey: "assessRoundSufficiency",
        eventType: "gap",
        round,
        title: `Round ${round} sufficiency`,
        summary: gapAssessment,
        metadataJson: JSON.stringify({
          sufficiencyStatus,
          readiness: assessment.readiness,
          acceptedSources: acceptedByKey.size,
          acceptedExtracts: extractsByKey.size,
          rejected: validation.rejected.map((item) => ({
            title: item.source.title,
            url: item.source.url,
            reason: item.reason,
          })),
          domainPenalties: Object.fromEntries(domainPenalties),
        }),
      });
      await ctx.runMutation(internal.agent.deepResearch.updateLoopProgress, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        roundCount: round,
        sufficiencyStatus,
      });
      const numberedAfterRead = numberSources(
        [...acceptedByKey.values()].map((item) => sanitizeRuntimeSource(item.source)),
      );
      await ctx.runMutation(internal.agent.deepResearch.recordRoundState, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        round,
        status: "completed",
        query: queries.map((item) => item.query).join(" | "),
        gapAssessment,
        sufficiencyStatus,
        sourceCount: acceptedByKey.size,
        extractCount: extractsByKey.size,
        stateJson: JSON.stringify({
          sources: summarizeSourceMetadata(numberedAfterRead),
          extracts: [...extractsByKey.values()].map((extract) => ({
            sourceKey: extract.sourceKey,
            citationNumber: extract.citationNumber,
            relevance: extract.relevance,
          })),
          readiness: assessment.readiness,
        }),
      });

      const roundCitationByKey = new Map(numberedAfterRead.map((source) => [sourceKey(source), source.citationNumber]));
      roundState.push({
        round,
        query: queries.map((item) => item.query).join(" | "),
        gapAssessment,
        sufficiencyStatus,
        stopReason: sufficiencyStatus === "sufficient" ? "sufficient_evidence" : undefined,
        sources: numberedAfterRead,
        extracts: [...extractsByKey.values()].map((extract) => ({
          ...extract,
          citationNumber: roundCitationByKey.get(extract.sourceKey) ?? extract.citationNumber,
        })),
      });
      await ctx.runMutation(internal.agent.deepResearch.markStep, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        stepKey: "assessRoundSufficiency",
        status: "completed",
        summary: `${sufficiencyStatus}: ${gapAssessment}`,
        sourceCount: acceptedByKey.size,
      });
      if (
        sufficiencyStatus === "sufficient" &&
        assessment.readiness.ready
      ) {
        break;
      }
      if (round < maxRounds && !assessment.readiness.ready) {
        gapAssessment = `${gapAssessment}\nNeed expansion: ${assessment.readiness.recommendation}`;
      }
    }

    const counterDecision = await shouldRunCounterEvidencePass({
      sufficiencyStatus,
      acceptedSourceCount: acceptedByKey.size,
      highRelevanceExtractCount: [...extractsByKey.values()].filter((extract) => extract.relevance === "high").length,
      extracts: [...extractsByKey.values()],
      prompt: args.prompt,
    });
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "runCounterEvidencePass",
      status: "running",
    });
    await ctx.runMutation(internal.agent.deepResearch.recordRunEvent, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      stepKey: "runCounterEvidencePass",
      eventType: "audit",
      title: "Counter-evidence pass",
      summary: counterDecision
        ? "Counter-evidence required by sufficiency confidence"
        : "Counter-evidence not required for this status",
      metadataJson: JSON.stringify({ sufficiencyStatus }),
    });
    if (counterDecision) {
      const counterBucket: SourceBucket = {
        name: "practitioner examples",
        queries: [`counter evidence criticism limitations ${args.prompt}`],
        preferredProviders: ["exa", "jina"],
        excludeDomains: [],
        freshnessTarget: "current",
        minAcceptedSources: 1,
      };
      const discovery = await discoverCandidates(ctx, {
        ownerUserId: args.ownerUserId,
        queries: [{ bucket: counterBucket, query: counterBucket.queries[0] }],
        excludedDomains: [],
      });
      await ctx.runMutation(internal.agent.sources.upsertRunCandidates, {
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        runId: args.runId,
        usage: "candidate",
        candidates: discovery.candidates.map((source) =>
          sourceForStorage(source, "candidate"),
        ),
      });
      mergeCandidatePool(candidatePool, discovery.candidates, {
        acceptedKeys: new Set(acceptedByKey.keys()),
        rejectedKeys: new Set(rejected.map((item) => sourceKey(item.source))),
      });
      const selected = await selectCandidatesToValidate(ctx, {
        ownerUserId: args.ownerUserId,
        query: counterBucket.queries[0],
        candidates: [...candidatePool.values()],
        acceptedKeys: new Set(acceptedByKey.keys()),
        rejectedKeys: new Set(rejected.map((item) => sourceKey(item.source))),
      });
      const validation = await validateAndRead(ctx, {
        ownerUserId: args.ownerUserId,
        runId: args.runId,
        threadId: args.threadId,
        candidates: selected.slice(0, 4),
        acceptedByDomain: acceptedDomainCounts([...acceptedByKey.values()].map((item) => item.source)),
        domainPenalties,
      });
      await recordValidationSources(ctx, {
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        runId: args.runId,
        accepted: validation.accepted,
        rejected: validation.rejected,
      });
      for (const item of validation.accepted) {
        acceptedByKey.set(sourceKey(item.source), item);
        if (extractsByKey.size < MAX_EXTRACTS_PER_RUN) {
          extractsByKey.set(`${item.extract.sourceKey}:${item.extract.quote.slice(0, 80)}`, item.extract);
        }
      }
      rejected.push(...validation.rejected);
      await ctx.runMutation(internal.agent.deepResearch.recordRunEvent, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        threadId: args.threadId,
        stepKey: "runCounterEvidencePass",
        eventType: "search",
        title: "Counter-evidence discovery",
        summary: `${validation.accepted.length} counter-evidence sources accepted from ${discovery.candidates.length} candidates`,
        metadataJson: JSON.stringify({
          counts: discovery.counts,
          accepted: validation.accepted.map((item) => item.source.title),
          rejected: validation.rejected.map((item) => ({ title: item.source.title, reason: item.reason })),
        }),
      });
    }
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "runCounterEvidencePass",
      status: "completed",
      summary: counterDecision ? "Counter-evidence dicek sebagai risiko sintesis" : "Dilewati sesuai budget",
    });

    if (sufficiencyStatus !== "sufficient" && roundState.length >= maxRounds) {
      sufficiencyStatus = "budget_exhausted";
      await ctx.runMutation(internal.agent.deepResearch.updateLoopProgress, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        roundCount: roundState.length,
        sufficiencyStatus,
      });
    }

    const finalSources = numberSources(
      [...acceptedByKey.values()].map((item) => sanitizeRuntimeSource(item.source)),
    );
    const citationByKey = new Map(finalSources.map((source) => [sourceKey(source), source.citationNumber]));
    const finalExtracts = [...extractsByKey.values()].map((extract) => ({
      ...extract,
      citationNumber: citationByKey.get(extract.sourceKey) ?? extract.citationNumber,
    }));

    return {
      sources: finalSources,
      extracts: finalExtracts,
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
    const readiness = assessEvidenceReadiness(args.sources, normalizeExtracts(args.extracts));
    const result = await generateText({
      model: chatProvider.chat(deepModelForAgent(args.agentKind)),
      system:
        readiness.ready
          ? "Write a source-grounded markdown research report. Cite every factual claim with persisted source numbers. Prefer accepted evidence extracts over snippets. If evidence is insufficient, keep that limitation visible and do not overstate certainty. Also produce a concise chat summary (2-4 natural paragraphs, no implementation details) for the user."
          : "Write a partial source-grounded markdown research artifact, not a full final recommendation report. State up front that accepted readable evidence did not meet the Deep Research target, cite only persisted source numbers, and ask for retry/expanded search before strong conclusions. Also produce a concise chat summary for the user.",
      prompt: [
        `Prompt:\n${args.prompt}`,
        `Research plan:\n${JSON.stringify(normalizePlan(args.plan, args.agentKind), null, 2)}`,
        `Evidence readiness:\n${JSON.stringify(readiness, null, 2)}`,
        `Round trace:\n${JSON.stringify(args.roundState, null, 2)}`,
        `Accepted evidence extracts:\n${extractBlock || "No extracted evidence beyond snippets."}`,
        `Sources:\n${sourceBlock}`,
      ].join("\n\n"),
      output: Output.object({
        schema: z.object({
          markdown: z.string().describe("Full research report in markdown with citations"),
          chatSummary: z.string().describe("Concise natural chat summary for the user, 2-4 paragraphs. No implementation details, workflow status, or database records."),
        }),
      }),
    });
    const markdown = result.output?.markdown?.trim() ?? result.text.trim();
    const chatSummary = result.output?.chatSummary?.trim() || buildPlainResponseSummary(markdown);
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "synthesize",
      status: "completed",
      summary: readiness.ready ? "Laporan markdown tersusun" : `Artifact parsial tersusun: ${readiness.recommendation}`,
    });
    return {
      markdown,
      chatSummary,
      summary: trimForSnippet(markdown.replace(/[#*_`>-]/g, ""), 220),
    };
  },
});

export const auditClaims = internalAction({
  args: {
    ...workflowArgs(),
    // The execute workflow spreads its full arg set (which includes `plan`)
    // into this action; accept it even though it is unused here.
    plan: v.optional(v.any()),
    sources: v.array(sourceRuntimeValidator()),
    extracts: v.any(),
    markdown: v.string(),
  },
  handler: async (ctx, args) => {
    await ensureNotCanceled(ctx, args.runId);
    await ctx.runMutation(internal.agent.deepResearch.updateVerificationStatus, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      verificationStatus: "checking",
    });
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "verifyClaimsSemantically",
      status: "running",
    });
    const cited = extractCitationNumbers(args.markdown);
    const checks = await verifyClaimsSemantically(args.markdown, args.sources, normalizeExtracts(args.extracts));
    const needsRevision = shouldReviseUnsupportedClaims(checks);
    let markdown = withEvidenceLimits(args.markdown, checks);
    let verificationStatus: VerificationStatus =
      checks.some((check) => check.support === "contradicted")
        ? "failed"
        : checks.some((check) => check.support === "unsupported" || check.support === "partially_supported" || check.support === "partial")
          ? "partial"
          : "passed";
    await ctx.runMutation(internal.agent.deepResearch.recordRunEvent, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      stepKey: "verifyClaimsSemantically",
      eventType: "audit",
      title: "Semantic claim verification",
      summary: `${checks.length} claims checked; ${checks.filter((check) => check.support !== "supported").length} weak or unsupported`,
      metadataJson: JSON.stringify({ cited: [...cited] }),
    });
    await ctx.runMutation(internal.agent.deepResearch.markStep, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "verifyClaimsSemantically",
      status: "completed",
      summary: `${checks.length} klaim diperiksa`,
    });
    if (needsRevision) {
      await ctx.runMutation(internal.agent.deepResearch.markStep, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        stepKey: "reviseUnsupportedClaims",
        status: "running",
      });
      markdown = await reviseUnsupportedMarkdown(args.markdown, checks, args.agentKind).catch(() => markdown);
      verificationStatus = "revised";
      for (const check of checks) {
        if (check.support === "contradicted" || check.support === "unsupported") {
          check.revisionAction = "removed_or_rewritten";
        }
      }
      await ctx.runMutation(internal.agent.deepResearch.markStep, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        stepKey: "reviseUnsupportedClaims",
        status: "completed",
        summary: "Klaim lemah direvisi atau diberi batasan",
      });
    } else {
      await ctx.runMutation(internal.agent.deepResearch.markStep, {
        runId: args.runId,
        ownerUserId: args.ownerUserId,
        stepKey: "reviseUnsupportedClaims",
        status: "completed",
        summary: "Tidak ada klaim high-impact yang perlu direvisi",
      });
    }
    await ctx.runMutation(internal.agent.deepResearch.updateVerificationStatus, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      verificationStatus,
    });
    return { markdown, checks };
  },
});

export const persistArtifact = internalMutation({
  args: {
    ...workflowArgs(),
    plan: v.optional(v.any()),
    sources: v.array(sourceRuntimeValidator()),
    extracts: v.any(),
    markdown: v.string(),
    checks: v.array(
      v.object({
        claim: v.string(),
        support: v.union(
          v.literal("supported"),
          v.literal("partially_supported"),
          v.literal("contradicted"),
          v.literal("partial"),
          v.literal("unsupported"),
        ),
        citationNumbers: v.array(v.number()),
        evidence: v.string(),
        verifierModel: v.optional(v.string()),
        confidence: v.optional(v.number()),
        failureReason: v.optional(v.string()),
        extractKeys: v.optional(v.array(v.string())),
        revisionAction: v.optional(v.union(v.literal("none"), v.literal("caveated"), v.literal("removed_or_rewritten"))),
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
      if (!run.activeArtifactId) {
        throw new ConvexError("Run canceled without artifact");
      }
      return { primaryArtifactId: run.activeArtifactId };
    }
    await markStepMutation(ctx, {
      runId: args.runId,
      ownerUserId: args.ownerUserId,
      stepKey: "persistArtifact",
      status: "running",
    });

    const extractIds = await persistExtractsForRun(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      extracts: normalizeExtracts(args.extracts),
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
    await persistCitationChecks(ctx, {
      ...args,
      artifactId: report.artifactId,
      artifactVersionId: report.versionId,
      sourceIdsByNumber: sourceIds,
      extractIdsByKey: extractIds,
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
    plan: v.optional(v.any()),
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
      retryable: run.sufficiencyStatus === "budget_exhausted" || run.sufficiencyStatus === "partial",
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
    // @convex-dev/workflow reports failures as kind "failed" (there is no
    // "error" kind). Without this, a failed workflow silently falls through to
    // the success path below and the run is mis-marked "completed".
    if (args.result?.kind === "failed") {
      await failRun(ctx, {
        runId,
        ownerUserId,
        stepKey: run.currentStep ?? "planRound",
        code: "workflow_failed",
        message: String(args.result.error ?? "Deep research failed"),
      });
      return;
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
    agentKind: v.optional(agentKindValidator),
  },
  handler: async (ctx, args) => {
    await assertRunOwner(ctx, args.runId, args.ownerUserId);
    await ctx.db.patch("agentRuns", args.runId, {
      promptSnapshot: args.promptSnapshot,
      maxRounds: Math.min(Math.max(1, args.maxRounds), roundCapForAgent(args.agentKind)),
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

export const recordRoundState = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    ownerUserId: v.string(),
    threadId: v.string(),
    round: v.number(),
    status: v.union(
      v.literal("planned"),
      v.literal("discovering"),
      v.literal("reading"),
      v.literal("assessing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    query: v.string(),
    gapAssessment: v.string(),
    sufficiencyStatus: v.union(
      v.literal("unknown"),
      v.literal("insufficient"),
      v.literal("partial"),
      v.literal("sufficient"),
      v.literal("budget_exhausted"),
    ),
    sourceCount: v.number(),
    extractCount: v.number(),
    stateJson: v.string(),
  },
  handler: async (ctx, args) => {
    await assertRunOwner(ctx, args.runId, args.ownerUserId);
    const now = Date.now();
    const existing = await ctx.db
      .query("researchRoundStates")
      .withIndex("by_owner_run_round", (q) =>
        q.eq("ownerUserId", args.ownerUserId).eq("runId", args.runId).eq("round", args.round),
      )
      .unique();
    const patch = {
      threadId: args.threadId,
      status: args.status,
      query: trimForSnippet(args.query, 1_500),
      gapAssessment: trimForSnippet(args.gapAssessment, 3_000),
      sufficiencyStatus: args.sufficiencyStatus,
      sourceCount: args.sourceCount,
      extractCount: args.extractCount,
      stateJson: args.stateJson,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch("researchRoundStates", existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("researchRoundStates", {
      ownerUserId: args.ownerUserId,
      runId: args.runId,
      round: args.round,
      createdAt: now,
      ...patch,
    });
  },
});

export const updateVerificationStatus = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    ownerUserId: v.string(),
    verificationStatus: v.union(
      v.literal("not_started"),
      v.literal("checking"),
      v.literal("passed"),
      v.literal("revised"),
      v.literal("partial"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, args) => {
    await assertRunOwner(ctx, args.runId, args.ownerUserId);
    await ctx.db.patch("agentRuns", args.runId, {
      verificationStatus: args.verificationStatus,
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
    commandId?: string;
    retryOfRunId?: Id<"agentRuns">;
    agentKind: AgentKind;
  },
) {
  const now = Date.now();
  const maxRounds = roundCapForAgent(args.agentKind);
  const runId = await ctx.db.insert("agentRuns", {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    promptMessageId: args.promptMessageId,
    mode: "deep",
    agentKind: args.agentKind,
    executionKind: "workflow",
    promptSnapshot: args.prompt ?? "",
    commandId: args.commandId,
    status: "queued",
    roundCount: 0,
    maxRounds,
    sufficiencyStatus: "unknown",
    verificationStatus: "not_started",
    budgetJson: JSON.stringify({
      maxRounds,
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
  const run = await ctx.db.get("agentRuns", runId);
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
  if (run) {
    await markThreadStatusAfterTerminalRun(ctx, {
      ownerUserId,
      threadId: run.threadId,
      runId,
      status: "idle",
      now,
    });
  }
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
  const run = await ctx.db.get("agentRuns", args.runId);
  await ctx.db.patch("agentRuns", args.runId, {
    status: "failed",
    failedStep: args.stepKey,
    retryable: true,
    errorCode: args.code,
    errorMessage: args.message,
    updatedAt: Date.now(),
  });
  if (run) {
    await markThreadStatusAfterTerminalRun(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: run.threadId,
      runId: args.runId,
      status: "failed",
    });
  }
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
    // Optional so legacy/in-flight workflow runs (started before this field
    // existed) still validate; handlers default to Pro behavior.
    agentKind: v.optional(agentKindValidator),
  };
}

function sourceRuntimeValidator() {
  return sourceCandidateValidator;
}

function normalizePlan(value: unknown, agentKind?: AgentKind): ResearchPlan {
  const plan = isRecord(value) ? value : {};
  return {
    title: stringValue(plan.title) || "Deep Research Report",
    questions: stringArray(plan.questions).slice(0, 5),
    sourceStrategy: stringValue(plan.sourceStrategy) || "Search academic and web providers for evidence, then read the strongest results.",
    reportIntent: stringValue(plan.reportIntent) || "Produce a cited research report.",
    sufficiencyCriteria: stringArray(plan.sufficiencyCriteria).slice(0, 6),
    initialQueries: stringArray(plan.initialQueries).slice(0, 5),
    maxRounds: clampRoundCount(numberValue(plan.maxRounds) ?? roundCapForAgent(agentKind), agentKind),
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
    model: chatProvider.chat(DEEP_LITE_MODEL),
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

async function planSourceBuckets(_ctx: ActionCtx, prompt: string, plan: ResearchPlan): Promise<SourceBucket[]> {
  const fallback = defaultSourceBuckets(prompt, plan);
  try {
    const object = await generateObject({
      model: chatProvider.chat(DEEP_LITE_MODEL),
      schema: z.object({
        buckets: z.array(z.object({
          name: z.enum([
            "academic",
            "industry reports",
            "vendor/platform docs",
            "government/regulation",
            "local Indonesia/contextual",
            "practitioner examples",
          ]),
          queries: z.array(z.string().min(2).max(240)).min(1).max(6),
          preferredProviders: z.array(z.enum(["exa", "jina", "arxiv", "crossref"])).min(1).max(4),
          includeDomains: z.array(z.string()).max(8).optional(),
          excludeDomains: z.array(z.string()).max(12).optional(),
          freshnessTarget: z.enum(["any", "recent", "current"]).optional(),
          minAcceptedSources: z.number().int().min(1).max(4),
        })).min(4).max(6),
      }),
      prompt: [
        "Create a source acquisition plan for Deep Research. Use diverse buckets and query variants. Prefer legal, readable, primary or high-quality secondary sources.",
        "Do not include social chatter unless the bucket is practitioner examples.",
        `User prompt: ${prompt}`,
        `Research plan: ${JSON.stringify(plan)}`,
      ].join("\n\n"),
    });
    return normalizeBuckets(object.object.buckets, fallback);
  } catch {
    return fallback;
  }
}

function defaultSourceBuckets(prompt: string, plan: ResearchPlan): SourceBucket[] {
  const seedQueries = [...plan.initialQueries, ...plan.questions, prompt]
    .filter(Boolean)
    .slice(0, 4);
  const baseQuery = seedQueries[0] || prompt;
  return [
    {
      name: "academic",
      queries: [`${baseQuery} empirical study`, `${baseQuery} systematic review`, `${baseQuery} arxiv`],
      preferredProviders: ["arxiv", "exa", "jina"],
      includeDomains: ["arxiv.org", "acm.org", "ieee.org", "springer.com", "sciencedirect.com"],
      minAcceptedSources: 2,
    },
    {
      name: "industry reports",
      queries: [`${baseQuery} industry report PDF`, `${baseQuery} market research report`],
      preferredProviders: ["exa", "jina"],
      excludeDomains: ["reddit.com", "quora.com"],
      freshnessTarget: "recent",
      minAcceptedSources: 2,
    },
    {
      name: "vendor/platform docs",
      queries: [`${baseQuery} official documentation`, `${baseQuery} platform docs best practices`],
      preferredProviders: ["exa", "jina"],
      minAcceptedSources: 2,
    },
    {
      name: "government/regulation",
      queries: [`${baseQuery} government regulation`, `${baseQuery} policy guidance`],
      preferredProviders: ["exa", "jina"],
      includeDomains: ["go.id", "gov", "europa.eu", "oecd.org", "worldbank.org"],
      minAcceptedSources: 1,
    },
    {
      name: "local Indonesia/contextual",
      queries: [`${baseQuery} Indonesia`, `${baseQuery} Bahasa Indonesia konteks lokal`],
      preferredProviders: ["exa", "jina"],
      includeDomains: ["go.id", "ac.id", "or.id"],
      freshnessTarget: "current",
      minAcceptedSources: 1,
    },
    {
      name: "practitioner examples",
      queries: [`${baseQuery} case study implementation`, `${baseQuery} engineering blog lessons learned`],
      preferredProviders: ["exa", "jina"],
      excludeDomains: ["reddit.com", "quora.com"],
      freshnessTarget: "recent",
      minAcceptedSources: 2,
    },
  ];
}

function normalizeBuckets(value: SourceBucket[], fallback: SourceBucket[]): SourceBucket[] {
  const buckets = value
    .map((bucket): SourceBucket => ({
      ...bucket,
      queries: bucket.queries.map((query) => query.trim()).filter(Boolean).slice(0, 6),
      preferredProviders: bucket.preferredProviders.length > 0 ? bucket.preferredProviders : ["exa", "jina"],
      minAcceptedSources: Math.min(Math.max(1, bucket.minAcceptedSources), 4),
    }))
    .filter((bucket) => bucket.queries.length > 0);
  return buckets.length > 0 ? buckets : fallback;
}

function tagDiscovery(
  sources: Array<Omit<SourceCandidate, "citationNumber">>,
  bucketName: string,
  discoveryQuery: string,
): DiscoveryCandidate[] {
  return sources.map((source) => ({
    ...source,
    bucketName,
    discoveryQuery,
    metadataJson: JSON.stringify({
      ...(safeJson(source.metadataJson) ?? {}),
      bucketName,
      discoveryQuery,
    }),
  }));
}

function sanitizeRuntimeSource(source: Omit<SourceCandidate, "citationNumber">): Omit<SourceCandidate, "citationNumber"> {
  const {
    origin,
    provider,
    providerRequestId,
    evidenceStrength,
    title,
    locator,
    url,
    doi,
    arxivId,
    snippet,
    readStatus,
    readError,
    rerankScore,
    metadataJson,
  } = source;
  return {
    origin,
    provider,
    providerRequestId,
    evidenceStrength,
    title,
    locator,
    url,
    doi,
    arxivId,
    snippet,
    readStatus,
    readError,
    rerankScore,
    metadataJson,
  };
}

function acceptedDomainCounts(sources: Array<Omit<SourceCandidate, "citationNumber">>) {
  const counts = new Map<string, number>();
  for (const source of sources) {
    const domain = sourceDomain(source);
    if (domain) {
      counts.set(domain, (counts.get(domain) ?? 0) + 1);
    }
  }
  return counts;
}

export function mergeCandidatePool(
  pool: Map<string, DiscoveryCandidate>,
  incoming: DiscoveryCandidate[],
  args: {
    acceptedKeys: Set<string>;
    rejectedKeys: Set<string>;
  },
) {
  pruneResolvedCandidates(pool, args);
  const newCandidates = dedupeSources(incoming).filter((source) => {
    const key = sourceKey(source);
    return !pool.has(key) && !args.acceptedKeys.has(key) && !args.rejectedKeys.has(key);
  });

  for (const candidate of newCandidates) {
    if (pool.size >= DISCOVERY_TARGET_PER_RUN) {
      const removableKey = oldestReplaceableCandidateKey(pool, candidate);
      if (!removableKey) {
        continue;
      }
      pool.delete(removableKey);
    }
    pool.set(sourceKey(candidate), candidate);
  }
}

function pruneResolvedCandidates(
  pool: Map<string, DiscoveryCandidate>,
  args: {
    acceptedKeys: Set<string>;
    rejectedKeys: Set<string>;
  },
) {
  for (const key of pool.keys()) {
    if (args.acceptedKeys.has(key) || args.rejectedKeys.has(key)) {
      pool.delete(key);
    }
  }
}

function oldestReplaceableCandidateKey(
  pool: Map<string, DiscoveryCandidate>,
  incoming: DiscoveryCandidate,
) {
  const incomingBucket = incoming.bucketName ?? "unknown";
  const incomingOrigin = incoming.origin;
  const bucketCounts = countBy([...pool.values()], (source) => source.bucketName ?? "unknown");
  const originCounts = countBy([...pool.values()], (source) => source.origin);
  for (const [key, source] of pool) {
    const bucket = source.bucketName ?? "unknown";
    if ((bucketCounts.get(bucket) ?? 0) > (bucketCounts.get(incomingBucket) ?? 0) + 1) {
      return key;
    }
  }
  for (const [key, source] of pool) {
    if ((originCounts.get(source.origin) ?? 0) > (originCounts.get(incomingOrigin) ?? 0) + 1) {
      return key;
    }
  }
  return pool.keys().next().value;
}

function countBy<T>(items: T[], keyFn: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function recentDateIso(daysBack: number) {
  return new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function safeJson(value: string | undefined) {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractDoiCandidates(text: string) {
  return [...text.matchAll(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/gi)]
    .map((match) => match[0].replace(/[).,;]+$/, "").toLowerCase())
    .slice(0, 3);
}

async function chooseRoundQueries(
  ctx: ActionCtx,
  args: {
    prompt: string;
    plan: ResearchPlan;
    buckets: SourceBucket[];
    round: number;
    previousSources: Array<Omit<SourceCandidate, "citationNumber">>;
    previousExtracts: ResearchExtract[];
    gapAssessment: string;
    rejected: RejectedSource[];
  },
) {
  if (args.round === 1) {
    return args.buckets.flatMap((bucket) =>
      bucket.queries.slice(0, 2).map((query) => ({ bucket, query })),
    ).slice(0, 8);
  }
  const rejectedDomains = [
    ...new Set(args.rejected.flatMap((item) => {
      const domain = sourceDomain(item.source);
      return domain ? [domain] : [];
    })),
  ].slice(0, 8);
  const expansions = await chooseExpansionQueries(ctx, {
    prompt: args.prompt,
    plan: args.plan,
    buckets: args.buckets,
    round: args.round,
    previousSources: args.previousSources,
    previousExtracts: args.previousExtracts,
    gapAssessment: args.gapAssessment,
    rejectedDomains,
  });
  if (expansions.length > 0) {
    return expansions;
  }
  const nextQuery = await chooseNextQuery(ctx, args);
  const expansionBucket: SourceBucket = {
    name: "practitioner examples",
    queries: [nextQuery],
    preferredProviders: ["exa", "jina"],
    excludeDomains: rejectedDomains,
    freshnessTarget: "current",
    minAcceptedSources: 2,
  };
  return [
    { bucket: expansionBucket, query: nextQuery },
    ...args.buckets
      .filter((bucket) => bucket.name !== expansionBucket.name)
      .slice(0, 4)
      .map((bucket) => ({ bucket, query: bucket.queries[Math.min(args.round - 1, bucket.queries.length - 1)] || args.prompt })),
  ];
}

async function chooseExpansionQueries(
  _ctx: ActionCtx,
  args: {
    prompt: string;
    plan: ResearchPlan;
    buckets: SourceBucket[];
    round: number;
    previousSources: Array<Omit<SourceCandidate, "citationNumber">>;
    previousExtracts: ResearchExtract[];
    gapAssessment: string;
    rejectedDomains: string[];
  },
) {
  try {
    const object = await generateObject({
      model: chatProvider.chat(DEEP_LITE_MODEL),
      schema: z.object({
        expansions: z.array(z.object({
          bucketName: z.string().min(2).max(80),
          query: z.string().min(2).max(240),
          rationale: z.string().min(2).max(400),
        })).min(1).max(8),
      }),
      prompt: [
        "Create targeted next-round search queries for Deep Research evidence gaps.",
        "Return one query per missing or weak source bucket. Do not repeat prior broad queries.",
        "Prefer readable primary, official, academic, government, vendor, and reputable industry sources.",
        `Prompt: ${args.prompt}`,
        `Plan: ${JSON.stringify(args.plan)}`,
        `Round: ${args.round}`,
        `Accepted source titles: ${args.previousSources.map((source) => source.title).join("; ")}`,
        `Accepted extracts: ${args.previousExtracts.map((extract) => extract.quote).join("\n")}`,
        `Rejected domains to avoid: ${args.rejectedDomains.join(", ") || "none"}`,
        `Gap assessment: ${args.gapAssessment}`,
        `Available buckets: ${args.buckets.map((bucket) => `${bucket.name}: ${bucket.queries.join(" | ")}`).join("\n")}`,
      ].join("\n\n"),
    });
    return object.object.expansions.flatMap((item) => {
      const bucket = args.buckets.find((candidate) => candidate.name === item.bucketName)
        ?? args.buckets.find((candidate) => item.bucketName.toLowerCase().includes(candidate.name))
        ?? args.buckets.find((candidate) => candidate.name.toLowerCase().includes(item.bucketName.toLowerCase()))
        ?? defaultExpansionBucket(item.query, args.rejectedDomains);
      const query = item.query.trim();
      return query ? [{ bucket, query }] : [];
    }).slice(0, 8);
  } catch {
    return [];
  }
}

function defaultExpansionBucket(query: string, rejectedDomains: string[]): SourceBucket {
  return {
    name: "practitioner examples",
    queries: [query],
    preferredProviders: ["exa", "jina"],
    excludeDomains: rejectedDomains,
    freshnessTarget: "current",
    minAcceptedSources: 2,
  };
}

async function discoverCandidates(
  ctx: ActionCtx,
  args: {
    ownerUserId: string;
    queries: Array<{ bucket: SourceBucket; query: string }>;
    excludedDomains: string[];
  },
) {
  const unreliableDomains = await ctx.runQuery(
    internal.agent.domainReliability.listUnreliableDomains,
    {},
  );
  const allExcludedDomains = [...new Set([...args.excludedDomains, ...unreliableDomains])];
  const byProvider = {
    exa: [] as Array<Omit<SourceCandidate, "citationNumber">>,
    jina: [] as Array<Omit<SourceCandidate, "citationNumber">>,
    arxiv: [] as Array<Omit<SourceCandidate, "citationNumber">>,
    crossref: [] as Array<Omit<SourceCandidate, "citationNumber">>,
  };

  for (const item of args.queries) {
    const providers = item.bucket.preferredProviders;
    const excludeDomains = [...(item.bucket.excludeDomains ?? []), ...allExcludedDomains];
    const tasks: Array<Promise<void>> = [];
    if (providers.includes("exa")) {
      tasks.push(searchExaCandidates(ctx, {
        ownerUserId: args.ownerUserId,
        query: item.query,
        limit: 10,
        includeDomains: item.bucket.includeDomains,
        excludeDomains,
        startPublishedDate: item.bucket.freshnessTarget === "current" ? recentDateIso(730) : undefined,
        category: item.bucket.name === "industry reports" ? "pdf" : undefined,
      }).then((results) => {
        byProvider.exa.push(...tagDiscovery(results, item.bucket.name, item.query));
      }).catch(() => undefined));
    }
    if (providers.includes("jina")) {
      tasks.push(searchJinaCandidates(ctx, {
        ownerUserId: args.ownerUserId,
        query: item.query,
        limit: 8,
        siteDomains: item.bucket.includeDomains,
        excludeDomains,
        country: item.bucket.name === "local Indonesia/contextual" ? "ID" : undefined,
        language: item.bucket.name === "local Indonesia/contextual" ? "id" : undefined,
        searchType: item.bucket.freshnessTarget === "current" ? "news" : "web",
      }).then((results) => {
        byProvider.jina.push(...tagDiscovery(results, item.bucket.name, item.query));
      }).catch(() => undefined));
    }
    if (providers.includes("arxiv")) {
      tasks.push(searchArxivProvider(ctx, {
        ownerUserId: args.ownerUserId,
        query: item.query,
        limit: 8,
      }).then((results) => {
        byProvider.arxiv.push(...tagDiscovery(results, item.bucket.name, item.query));
      }).catch(() => undefined));
    }
    await Promise.all(tasks);
  }

  const candidates = dedupeSources([
    ...byProvider.exa,
    ...byProvider.jina,
    ...byProvider.arxiv,
    ...byProvider.crossref,
  ]).slice(0, DISCOVERY_TARGET_PER_RUN);
  const doiCandidates = await lookupDiscoveredDois(ctx, args.ownerUserId, candidates);
  byProvider.crossref.push(...doiCandidates);
  const enrichedCandidates = dedupeSources([...candidates, ...doiCandidates]).slice(0, DISCOVERY_TARGET_PER_RUN);

  return {
    byProvider,
    candidates: enrichedCandidates,
    counts: {
      exa: byProvider.exa.length,
      jina: byProvider.jina.length,
      arxiv: byProvider.arxiv.length,
      crossref: byProvider.crossref.length,
      deduped: enrichedCandidates.length,
    },
  };
}

async function lookupDiscoveredDois(
  ctx: ActionCtx,
  ownerUserId: string,
  candidates: Array<Omit<SourceCandidate, "citationNumber">>,
) {
  const dois = [
    ...new Set(candidates.flatMap((source) => source.doi ? [source.doi] : extractDoiCandidates(`${source.title} ${source.snippet} ${source.url ?? ""}`))),
  ].slice(0, 4);
  const results = await Promise.all(
    dois.map((doi) => lookupDoiProvider(ctx, { ownerUserId, doi }).catch(() => [])),
  );
  return results.flat();
}

async function recordValidationSources(
  ctx: ActionCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    runId: Id<"agentRuns">;
    accepted: AcceptedSource[];
    rejected: RejectedSource[];
  },
) {
  if (args.accepted.length > 0) {
    await ctx.runMutation(internal.agent.sources.upsertRunCandidates, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      usage: "accepted",
      candidates: args.accepted.map((item) =>
        sourceForStorage(item.source, "accepted", item.quality.reason),
      ),
    });
  }
  if (args.rejected.length > 0) {
    await ctx.runMutation(internal.agent.sources.upsertRunCandidates, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      usage: "rejected",
      candidates: args.rejected.map((item) =>
        sourceForStorage(item.source, "rejected", item.reason),
      ),
    });
  }
}

async function selectCandidatesToValidate(
  ctx: ActionCtx,
  args: {
    ownerUserId: string;
    query: string;
    candidates: DiscoveryCandidate[];
    acceptedKeys: Set<string>;
    rejectedKeys: Set<string>;
  },
) {
  const candidates = args.candidates.filter((source) => {
    const key = sourceKey(source);
    return !args.acceptedKeys.has(key) && !args.rejectedKeys.has(key) && assessSourceQuality(source).reason !== "provider_failure";
  });
  const documents = candidates.map((source) => ({
    sourceKey: sourceKey(source),
    title: source.title,
    text: source.snippet,
  }));
  const reranked = await jinaRerank(ctx, {
    ownerUserId: args.ownerUserId,
    query: args.query,
    documents,
    topN: Math.min(14, documents.length),
  }).catch(() => []);
  const byKey = new Map(candidates.map((source) => [sourceKey(source), source]));
  const selected: DiscoveryCandidate[] = [];
  for (const ranked of reranked) {
    const source = byKey.get(ranked.sourceKey);
    if (source) {
      selected.push({ ...source, rerankScore: ranked.score });
    }
  }
  return diversifyCandidates(selected.length > 0 ? selected : candidates).slice(0, 14);
}

async function validateAndRead(
  ctx: ActionCtx,
  args: {
    ownerUserId: string;
    runId: Id<"agentRuns">;
    threadId: string;
    candidates: DiscoveryCandidate[];
    acceptedByDomain: Map<string, number>;
    domainPenalties: Map<string, number>;
  },
) {
  const accepted: AcceptedSource[] = [];
  const rejected: RejectedSource[] = [];

  for (const source of args.candidates) {
    const domain = sourceDomain(source);
    if (domain && (args.domainPenalties.get(domain) ?? 0) >= 2) {
      rejected.push({ source, reason: "domain_penalized" });
      continue;
    }
    if (domain && (args.acceptedByDomain.get(domain) ?? 0) >= PER_DOMAIN_ACCEPTED_CAP) {
      rejected.push({ source, reason: "domain_cap" });
      continue;
    }

    const readAttempts = await readSourceWithFallbacks(ctx, args.ownerUserId, source).catch((error) => [{
      provider: "none" as const,
      ok: false,
      title: source.title,
      url: source.url ?? source.locator,
      text: "",
      snippet: source.snippet,
      failureReason: error instanceof Error ? error.message : String(error),
    }]);
    const best = bestReadableAttempt(source, readAttempts);
    const quality = best
      ? assessSourceQuality(source, best.text || best.snippet)
      : failedReadQuality(source, readAttempts);
    if (!quality.ok) {
      rejected.push({ source, reason: quality.reason, readAttempts });
      if (domain && (quality.reason === "blocked" || quality.reason === "empty")) {
        args.domainPenalties.set(domain, (args.domainPenalties.get(domain) ?? 0) + 1);
      }
      await recordReadAttempt(ctx, args, source, readAttempts, quality);
      continue;
    }

    const sourceKeyValue = sourceKey(source);
    const citationNumber = 0;
    const quoteText = best?.text || source.snippet;
    const acceptedSource = {
      ...source,
      title: best?.title || source.title,
      locator: best?.url || source.url || source.locator,
      url: best?.url || source.url,
      snippet: trimForSnippet(best?.snippet || quoteText || source.snippet, 1_200),
      readStatus: "ready" as const,
      metadataJson: JSON.stringify({
        bucketName: source.bucketName,
        discoveryQuery: source.discoveryQuery,
        readProviders: readAttempts.map((attempt) => ({ provider: attempt.provider, ok: attempt.ok, failureReason: attempt.failureReason })),
        quality,
      }),
    };
    const extract: ResearchExtract = {
      sourceKey: sourceKeyValue,
      citationNumber,
      title: acceptedSource.title,
      locator: acceptedSource.url ?? acceptedSource.locator,
      quote: trimForSnippet(quoteText, 1_400),
      relevance: source.rerankScore && source.rerankScore > 0.6 ? "high" : "medium",
      rerankScore: source.rerankScore,
    };
    accepted.push({ source: acceptedSource, extract, quality, readAttempts });
    if (domain) {
      args.acceptedByDomain.set(domain, (args.acceptedByDomain.get(domain) ?? 0) + 1);
    }
    await recordReadAttempt(ctx, args, acceptedSource, readAttempts, quality);
  }

  return { accepted, rejected };
}

async function readSourceWithFallbacks(
  ctx: ActionCtx,
  ownerUserId: string,
  source: DiscoveryCandidate,
): Promise<ReadAttempt[]> {
  if (!source.url) {
    return [{
      provider: "none",
      ok: true,
      title: source.title,
      url: source.locator,
      text: source.snippet,
      snippet: source.snippet,
    }];
  }

  const attempts: ReadAttempt[] = [];
  const exa = await readWithExaContents(ctx, { ownerUserId, url: source.url });
  attempts.push({
    provider: "exa",
    ok: exa.ok,
    title: exa.title,
    url: exa.url,
    text: exa.markdown,
    snippet: exa.snippet,
    failureReason: exa.failureReason,
  });
  if (assessSourceQuality(source, exa.markdown || exa.snippet).ok) {
    return attempts;
  }

  const jina = await readWithJinaReader(ctx, { ownerUserId, url: source.url });
  attempts.push({
    provider: "jina",
    ok: jina.ok,
    title: jina.title,
    url: jina.url,
    text: jina.markdown,
    snippet: jina.snippet,
    failureReason: jina.failureReason,
  });
  return attempts;
}

export function bestReadableAttempt(
  source: DiscoveryCandidate,
  attempts: ReadAttempt[],
) {
  return attempts.find((attempt) =>
    attempt.ok && assessSourceQuality(source, attempt.text || attempt.snippet).ok,
  );
}

export function failedReadQuality(
  source: DiscoveryCandidate,
  attempts: ReadAttempt[],
): SourceQuality {
  const blocked = attempts.find((attempt) =>
    assessSourceQuality(source, attempt.text || attempt.snippet).reason === "blocked",
  );
  if (blocked) {
    return { ok: false, reason: "blocked" };
  }
  if (source.url && attempts.length > 0 && attempts.every((attempt) => !attempt.ok)) {
    return { ok: false, reason: "provider_failure" };
  }
  return assessSourceQuality(source, source.url ? "" : source.snippet);
}

function diversifyCandidates(candidates: DiscoveryCandidate[]) {
  const selected: DiscoveryCandidate[] = [];
  const deferred: DiscoveryCandidate[] = [];
  const originCounts = new Map<string, number>();
  const domainCounts = new Map<string, number>();
  const bucketCounts = new Map<string, number>();

  for (const candidate of candidates) {
    const origin = candidate.origin;
    const domain = sourceDomain(candidate) ?? "unknown";
    const bucket = candidate.bucketName ?? "unknown";
    const originCount = originCounts.get(origin) ?? 0;
    const domainCount = domainCounts.get(domain) ?? 0;
    const bucketCount = bucketCounts.get(bucket) ?? 0;

    if (originCount >= 6 || domainCount >= 3 || bucketCount >= 4) {
      deferred.push(candidate);
      continue;
    }
    selected.push(candidate);
    originCounts.set(origin, originCount + 1);
    domainCounts.set(domain, domainCount + 1);
    bucketCounts.set(bucket, bucketCount + 1);
  }

  return [...selected, ...deferred];
}

async function recordReadAttempt(
  ctx: ActionCtx,
  args: { runId: Id<"agentRuns">; ownerUserId: string; threadId: string },
  source: Omit<SourceCandidate, "citationNumber">,
  readAttempts: ReadAttempt[],
  quality: SourceQuality,
) {
  const best = readAttempts.find((attempt) => attempt.ok);
  await ctx.runMutation(internal.agent.deepResearch.recordRunEvent, {
    runId: args.runId,
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    stepKey: "readRoundSources",
    eventType: "read",
    title: best?.title || source.title,
    summary: quality.ok
      ? trimForSnippet(best?.snippet || source.snippet, 300)
      : `Rejected: ${quality.reason}`,
    metadataJson: JSON.stringify({
      sourceKey: sourceKey(source),
      url: source.url,
      quality,
      readAttempts: readAttempts.map((attempt) => ({
        provider: attempt.provider,
        ok: attempt.ok,
        failureReason: attempt.failureReason,
      })),
    }),
  });
  const domain = sourceDomain(source);
  if (domain) {
    await ctx.runMutation(internal.agent.domainReliability.recordOutcome, {
      domain,
      success: quality.ok,
      failureReason: quality.ok ? undefined : quality.reason,
    });
  }
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
  const readiness = assessEvidenceReadiness(args.sources, args.extracts);
  const object = await generateObject({
    model: chatProvider.chat(DEEP_LITE_MODEL),
    schema: z.object({
      sufficiencyStatus: z.enum(["insufficient", "partial", "sufficient"]),
      gapAssessment: z.string(),
    }),
    prompt: [
      "Assess whether the evidence is sufficient to write a useful report for this specific topic.",
      "Consider: topic breadth, available source diversity, bias risk, and whether the evidence gaps are fillable with more rounds.",
      "A narrow topic may be 'sufficient' with fewer sources if they are high-quality and diverse enough.",
      `Prompt: ${args.prompt}`,
      `Criteria: ${args.plan.sufficiencyCriteria.join("; ")}`,
      `Evidence metrics: ${JSON.stringify(readiness)}`,
      `Previous assessment: ${args.previousGapAssessment}`,
      `Round: ${args.round} of ${args.maxRounds}`,
      `Sources: ${args.sources.map((source) => `[${source.citationNumber}] ${source.title}: ${source.snippet}`).join("\n")}`,
      `Extracts: ${args.extracts.map((extract) => `[${extract.citationNumber}] ${extract.quote}`).join("\n")}`,
    ].join("\n\n"),
  });
  return {
    sufficiencyStatus: object.object.sufficiencyStatus,
    gapAssessment: object.object.gapAssessment,
    readiness,
  };
}

export function assessEvidenceReadiness(
  sources: SourceCandidate[],
  extracts: ResearchExtract[],
): EvidenceReadiness {
  const readableSources = sources.filter((source) => source.readStatus === "ready" || source.origin === "arxiv");
  const domainCount = new Set(readableSources.flatMap((source) => {
    const domain = sourceDomain(source);
    return domain ? [domain] : [];
  })).size;
  const bucketCount = new Set(readableSources.flatMap((source) => {
    const metadata = safeJson(source.metadataJson);
    const bucketName = stringValue(metadata?.bucketName);
    return bucketName ? [bucketName] : [];
  })).size;
  const highQualityExtractCount = extracts.filter((extract) =>
    extract.relevance === "high" || (extract.quote.length >= 500 && extract.relevance !== "low"),
  ).length;
  const missing = [
    readableSources.length < MIN_ACCEPTED_SOURCES
      ? `${MIN_ACCEPTED_SOURCES - readableSources.length} more readable sources`
      : null,
    extracts.length < MIN_ACCEPTED_EXTRACTS
      ? `${MIN_ACCEPTED_EXTRACTS - extracts.length} more accepted extracts`
      : null,
    domainCount < MIN_DOMAIN_DIVERSITY
      ? `${MIN_DOMAIN_DIVERSITY - domainCount} more source domains`
      : null,
    bucketCount < MIN_BUCKET_COVERAGE
      ? `${MIN_BUCKET_COVERAGE - bucketCount} more evidence buckets`
      : null,
    highQualityExtractCount < Math.min(4, MIN_ACCEPTED_EXTRACTS)
      ? `${Math.min(4, MIN_ACCEPTED_EXTRACTS) - highQualityExtractCount} stronger extracts`
      : null,
  ].filter((item): item is string => Boolean(item));
  const ready = missing.length === 0;
  return {
    ready,
    status: ready ? "sufficient" : readableSources.length >= 6 && extracts.length >= 5 ? "partial" : "insufficient",
    readableSourceCount: readableSources.length,
    extractCount: extracts.length,
    domainCount,
    bucketCount,
    highQualityExtractCount,
    missing,
    recommendation: ready
      ? "Evidence is diverse and readable enough for synthesis."
      : missing.join("; "),
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
  return canonicalSourceKey(source);
}

function sourceForStorage(
  source: Omit<SourceCandidate, "citationNumber">,
  usage: "candidate" | "accepted" | "rejected",
  qualityReason?: string,
): SourceCandidate {
  return {
    ...source,
    citationNumber: 0,
    sourceKey: sourceKey(source),
    usage,
    qualityReason,
  };
}

function numberSources(sources: Array<Omit<SourceCandidate, "citationNumber">>): SourceCandidate[] {
  return sources.slice(0, MAX_SOURCES_PER_RUN).map((source, index) => ({
    ...source,
    citationNumber: index + 1,
    sourceKey: sourceKey(source),
    usage: "accepted" as const,
  }));
}

function summarizeSourceDiscovery(args: {
  exa?: Array<Omit<SourceCandidate, "citationNumber">>;
  arxiv?: Array<Omit<SourceCandidate, "citationNumber">>;
  jina?: Array<Omit<SourceCandidate, "citationNumber">>;
  crossref?: Array<Omit<SourceCandidate, "citationNumber">>;
}) {
  const groups = [
    sourceGroupSummary("Exa", args.exa ?? []),
    sourceGroupSummary("Jina", args.jina ?? []),
    sourceGroupSummary("arXiv", args.arxiv ?? []),
    sourceGroupSummary("Crossref", args.crossref ?? []),
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

async function extractVerifiableClaims(markdown: string): Promise<string[]> {
  const object = await generateObject({
    model: chatProvider.chat(DEEP_LITE_MODEL),
    schema: z.object({
      claims: z.array(z.string().min(20).max(500)).max(16),
    }),
    prompt: [
      "Extract up to 16 factual claims from this research report that should be verified against evidence.",
      "Focus on: causal claims, statistical assertions, recommendations, comparisons, and definitive statements.",
      "Skip: headings, meta-commentary, evidence limit sections, and purely structural text.",
      "Each claim should be a complete, self-contained statement including any citation markers like [1].",
      `Report:\n${markdown}`,
    ].join("\n"),
  });
  return object.object.claims;
}

async function verifyClaimsSemantically(
  markdown: string,
  sources: SourceCandidate[],
  extracts: ResearchExtract[],
) {
  const sourceNumbers = new Set(sources.map((source) => source.citationNumber));
  const claims = await extractVerifiableClaims(markdown);
  const structural = claims.map((claim): CitationCheckDraft => {
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
      verifierModel: DEEP_LITE_MODEL,
      confidence: support === "supported" ? 0.55 : 0.35,
      extractKeys: relevantEvidence.map((extract) => extractKey(extract)),
      revisionAction: "none",
    };
  });
  const verified: CitationCheckDraft[] = [];
  for (const check of structural) {
    const evidence = extracts
      .filter((extract) => check.citationNumbers.includes(extract.citationNumber))
      .map((extract) => `[${extract.citationNumber}] ${extract.quote}`)
      .join("\n");
    if (!evidence) {
      verified.push(check);
      continue;
    }
    try {
      const result = await generateObject({
        model: chatProvider.chat(DEEP_LITE_MODEL),
        schema: z.object({
          support: z.enum(["supported", "partially_supported", "contradicted", "unsupported"]),
          confidence: z.number().min(0).max(1),
          failureReason: z.string().optional(),
        }),
        prompt: [
          "Classify whether the evidence supports the factual claim.",
          "Use supported only when the cited extract directly backs the claim. Use partially_supported when only part of the claim is backed. Use contradicted when evidence says the opposite. Use unsupported when evidence does not substantiate it.",
          `Claim:\n${check.claim}`,
          `Evidence:\n${evidence}`,
        ].join("\n\n"),
      });
      verified.push(normalizeSemanticVerifierOutput(check, result.object));
    } catch (error) {
      verified.push({
        ...check,
        failureReason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return verified;
}

export function normalizeSemanticVerifierOutput(
  fallback: CitationCheckDraft,
  value: unknown,
): CitationCheckDraft {
  const object = isRecord(value) ? value : {};
  const support = semanticSupportValue(object.support) ?? fallback.support;
  const confidence = numberValue(object.confidence);
  return {
    ...fallback,
    support,
    confidence: confidence === undefined ? fallback.confidence : Math.min(Math.max(confidence, 0), 1),
    failureReason: stringValue(object.failureReason),
  };
}

function semanticSupportValue(value: unknown): CitationSupport | undefined {
  if (
    value === "supported" ||
    value === "partially_supported" ||
    value === "contradicted" ||
    value === "unsupported"
  ) {
    return value;
  }
  if (value === "partial") {
    return "partially_supported";
  }
  return undefined;
}

function withEvidenceLimits(markdown: string, checks: CitationCheckDraft[]) {
  const weak = checks.filter((check) =>
    check.support === "partially_supported" ||
    check.support === "partial" ||
    check.support === "unsupported" ||
    check.support === "contradicted",
  );
  if (weak.length === 0 || /##\s+Evidence Limits/i.test(markdown)) {
    return markdown;
  }
  const limits = [
    "",
    "## Evidence Limits",
    "The verifier found claims that were only partly supported, unsupported, or contradicted by the accepted extracts:",
    ...weak.slice(0, 6).map((check) => `- ${check.support}: ${check.claim}`),
  ].join("\n");
  return `${markdown.trim()}\n${limits}`;
}

async function reviseUnsupportedMarkdown(
  markdown: string,
  checks: CitationCheckDraft[],
  agentKind?: AgentKind,
) {
  const weak = checks.filter((check) => check.support === "unsupported" || check.support === "contradicted");
  if (weak.length === 0) {
    return markdown;
  }
  const result = await generateText({
    model: chatProvider.chat(deepModelForAgent(agentKind)),
    system: [
      "Revise the markdown report to remove, soften, or explicitly caveat contradicted and unsupported factual claims.",
      "Keep supported claims and citations intact. Keep the Evidence Limits section when any uncertainty remains.",
    ].join(" "),
    prompt: [
      `Markdown:\n${markdown}`,
      `Weak claims:\n${JSON.stringify(weak, null, 2)}`,
    ].join("\n\n"),
  });
  return withEvidenceLimits(result.text.trim() || markdown, checks);
}

export function shouldReviseUnsupportedClaims(checks: Array<Pick<CitationCheckDraft, "support" | "claim" | "confidence">>) {
  return checks.some((check) =>
    check.support === "contradicted" ||
    (check.support === "unsupported" && (check.confidence ?? 0) >= 0.6),
  );
}

function extractKey(extract: ResearchExtract) {
  return `${extract.sourceKey}:${extract.citationNumber}:${extract.quote.slice(0, 80)}`;
}

function extractCitationNumbers(text: string) {
  return new Set([...text.matchAll(/\[(\d{1,3})\]/g)].map((match) => Number(match[1])));
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

function clampRoundCount(value: number, agentKind?: AgentKind) {
  return Math.min(Math.max(1, Math.floor(value)), roundCapForAgent(agentKind));
}

export async function shouldRunCounterEvidencePass(args: {
  sufficiencyStatus: SufficiencyStatus;
  acceptedSourceCount: number;
  highRelevanceExtractCount: number;
  extracts: ResearchExtract[];
  prompt: string;
}): Promise<boolean> {
  if (args.acceptedSourceCount < 3) return false;
  const object = await generateObject({
    model: chatProvider.chat(DEEP_LITE_MODEL),
    schema: z.object({
      needsCounterEvidence: z.boolean(),
      rationale: z.string(),
    }),
    prompt: [
      "Decide whether this research needs a counter-evidence pass.",
      "Counter-evidence is valuable when: claims are prescriptive/causal, topic is controversial, evidence is one-sided, or high-impact recommendations are made.",
      "Skip when: topic is purely descriptive, evidence already shows multiple perspectives, or sources are too few to meaningfully challenge.",
      `Sufficiency: ${args.sufficiencyStatus}`,
      `Sources: ${args.acceptedSourceCount}, High extracts: ${args.highRelevanceExtractCount}`,
      `Topic: ${args.prompt}`,
      `Sample claims: ${args.extracts.slice(0, 5).map((e) => e.quote.slice(0, 200)).join("\n")}`,
    ].join("\n"),
  });
  return object.object.needsCounterEvidence;
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
    const sourceKeyValue = source.sourceKey ?? sourceKey(source);
    const existing = await ctx.db
      .query("researchSources")
      .withIndex("by_owner_run_source_key", (q) =>
        q
          .eq("ownerUserId", args.ownerUserId)
          .eq("runId", args.runId)
          .eq("sourceKey", sourceKeyValue),
      )
      .unique();
    const value = {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      artifactId: args.artifactId,
      artifactVersionId: args.artifactVersionId,
      sourceKey: sourceKeyValue,
      usage: "accepted" as const,
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
      qualityReason: source.qualityReason,
      bucketName: source.bucketName,
      discoveryQuery: source.discoveryQuery,
      rerankScore: source.rerankScore,
      metadataJson: source.metadataJson,
      lastSeenAt: now,
    };
    const sourceId = existing
      ? existing._id
      : await ctx.db.insert("researchSources", {
        ...value,
        createdAt: now,
      });
    if (existing) {
      await ctx.db.patch("researchSources", existing._id, value);
    }
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
  const ids = new Map<string, Id<"researchExtracts">>();
  for (const extract of args.extracts.slice(0, MAX_EXTRACTS_PER_RUN)) {
    const id = await ctx.db.insert("researchExtracts", {
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
    });
    ids.set(extractKey(extract), id);
  }
  return ids;
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
      support: CitationSupport;
      citationNumbers: number[];
      evidence: string;
      verifierModel?: string;
      confidence?: number;
      failureReason?: string;
      extractKeys?: string[];
      revisionAction?: "none" | "caveated" | "removed_or_rewritten";
    }>;
    sourceIdsByNumber: Map<number, Id<"researchSources">>;
    extractIdsByKey: Map<string, Id<"researchExtracts">>;
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
        verifierModel: check.verifierModel,
        confidence: check.confidence,
        failureReason: check.failureReason,
        extractIds: check.extractKeys
          ?.map((key) => args.extractIdsByKey.get(key))
          .filter((id): id is Id<"researchExtracts"> => Boolean(id)),
        revisionAction: check.revisionAction,
        evidence: check.evidence,
        createdAt: now,
      }),
    ),
  );
}
