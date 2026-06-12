"use node";

// Sandbox compute entrypoint. Orchestrates a full statistical verification from a
// Convex Node action: gate (rate limit + credit) → LLM claim extraction (for GRIM
// /power) → provenance record → ONE ephemeral sandbox running statcheck + GRIM +
// power → deterministic classification → persist checks + per-artifact report +
// "compute" event. The sandbox is always torn down inside the vendor's `finally`.
// Until DAYTONA_STATVERIFY_SNAPSHOT + DAYTONA_API_KEY are set this returns
// `not_configured` so callers degrade gracefully instead of throwing.

import { v } from "convex/values";
import { createHash } from "node:crypto";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalAction, type ActionCtx } from "../../_generated/server";
import { estimateCredits } from "../../billing/catalog";
import { rateLimiter } from "../../limits";
import { extractVerificationClaims } from "./claimExtraction";
import type {
  ComputationCheckKind,
  ComputationOutcome,
  OutcomeSummary,
} from "./computationOutcome";
import { classifyGrimRow, parseGrimStdout, type GrimCheck } from "./grimClassify";
import {
  classifyPowerRow,
  parsePowerStdout,
  POWER_ADEQUACY_THRESHOLD,
  type PowerCheck,
} from "./powerClassify";
import {
  buildClaimText,
  classifyStatcheckRow,
  DEFAULT_STATCHECK_TOLERANCE,
  parseStatcheckStdout,
} from "./statcheckClassify";
import {
  buildVerificationReport,
  type VerificationVerdict,
} from "./verificationReport";
import { runSandboxSession, type SandboxCommandResult } from "./sandboxVendor";
import {
  STATCHECK_COMMAND,
  STATCHECK_INPUT_PATH,
  STATCHECK_R,
  STATCHECK_SCRIPT_PATH,
} from "./scripts/statcheck";
import {
  GRIM_CLAIMS_PATH,
  GRIM_COMMAND,
  GRIM_R,
  GRIM_SCRIPT_PATH,
} from "./scripts/grim";
import {
  POWER_CLAIMS_PATH,
  POWER_COMMAND,
  POWER_R,
  POWER_SCRIPT_PATH,
} from "./scripts/power";
import {
  META_COMMAND,
  META_FOREST_READ_COMMAND,
  META_FUNNEL_READ_COMMAND,
  META_R,
  META_SCRIPT_PATH,
  META_STUDIES_PATH,
} from "./scripts/metaanalysis";
import {
  describeHeterogeneity,
  parseMetaStdout,
  suggestsPublicationBias,
  type MetaAnalysisResult,
} from "./metaAnalysisClassify";
import { extractMetaStudies } from "./metaClaimExtraction";

const SANDBOX_PROVIDER = "daytona";
const VERIFICATION_TIMEOUT_SECONDS = 90;
const STDOUT_CLIP_CHARS = 4_000;
const ERROR_CLIP_CHARS = 1_000;

export interface VerificationCheckItem {
  checkKind: ComputationCheckKind;
  outcome: ComputationOutcome;
  claimText: string;
  detail: string;
}

// The gate/env outcomes shared by every sandbox compute task. Inlined into each
// task's result union so callers can switch on `status` uniformly.
export type SandboxGateBlock =
  | { status: "not_configured" }
  | { status: "rate_limited"; retryAfterMs: number }
  | { status: "quota_blocked"; reason: string; requiredPlan: string };

export type StatVerificationResult =
  | {
      status: "completed";
      sandboxRunId: Id<"sandboxRuns">;
      verdict: VerificationVerdict;
      summary: OutcomeSummary;
      byKind: Record<ComputationCheckKind, OutcomeSummary>;
      items: VerificationCheckItem[];
    }
  | SandboxGateBlock
  | {
      status: "failed";
      sandboxRunId: Id<"sandboxRuns"> | null;
      errorMessage: string;
    };

export type MetaAnalysisRunResult =
  | {
      status: "completed";
      sandboxRunId: Id<"sandboxRuns">;
      summary: MetaAnalysisResult;
      heterogeneity: "low" | "moderate" | "high" | null;
      publicationBiasSignal: boolean;
    }
  | SandboxGateBlock
  | {
      status: "failed";
      sandboxRunId: Id<"sandboxRuns"> | null;
      errorMessage: string;
    };

// Discriminated by taskKind so the runComputation tool can shape a neutral message
// per task without re-querying.
export type SandboxComputeResult =
  | ({ kind: "stat_verification" } & StatVerificationResult)
  | ({ kind: "meta_analysis" } & MetaAnalysisRunResult);

// One classified check, ready to persist plus a compact item for the response.
interface ClassifiedCheck {
  persist: {
    checkKind: ComputationCheckKind;
    claimText: string;
    claimSpan?: string;
    reportedJson: string;
    recomputedJson: string;
    outcome: ComputationOutcome;
    toleranceJson: string;
  };
  item: VerificationCheckItem;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function resultByKey(
  results: SandboxCommandResult[],
  key: string,
): SandboxCommandResult | undefined {
  return results.find((result) => result.key === key);
}

function fmtP(value: number | null): string {
  return value == null ? "?" : value.toString();
}

function statcheckChecks(stdout: string): ClassifiedCheck[] {
  const tolerance = DEFAULT_STATCHECK_TOLERANCE;
  const toleranceJson = JSON.stringify(tolerance);
  return parseStatcheckStdout(stdout).map((row) => {
    const outcome = classifyStatcheckRow(row, tolerance);
    const claimText = buildClaimText(row);
    return {
      persist: {
        checkKind: "statcheck",
        claimText,
        claimSpan: row.raw ?? undefined,
        reportedJson: JSON.stringify({
          comparison: row.reportedComparison,
          pValue: row.reportedPValue,
          statistic: row.statistic,
          df1: row.df1,
          df2: row.df2,
          testValue: row.testValue,
          oneTailedInTxt: row.oneTailedInTxt,
        }),
        recomputedJson: JSON.stringify({
          pValue: row.computedPValue,
          statcheckError: row.statcheckError,
          statcheckDecisionError: row.statcheckDecisionError,
        }),
        outcome,
        toleranceJson,
      },
      item: {
        checkKind: "statcheck",
        outcome,
        claimText,
        detail: `reported p ${row.reportedComparison} ${fmtP(row.reportedPValue)} vs recomputed p = ${fmtP(row.computedPValue)}`,
      },
    };
  });
}

function recomputedFlag(outcome: ComputationOutcome): boolean | null {
  if (outcome === "consistent") return true;
  if (outcome === "discrepant") return false;
  return null;
}

function grimCheckToClassified(check: GrimCheck): ClassifiedCheck {
  const sdPart = check.sd != null ? `, SD = ${check.sd}` : "";
  const itemsPart = check.items != null && check.items > 1 ? `, ${check.items} item` : "";
  const claimText = `${check.label}: M = ${check.mean ?? "?"}${sdPart}, N = ${check.n ?? "?"}${itemsPart}`;
  return {
    persist: {
      checkKind: check.kind,
      claimText,
      reportedJson: JSON.stringify({
        mean: check.mean,
        sd: check.sd,
        n: check.n,
        items: check.items,
      }),
      recomputedJson: JSON.stringify({
        consistent: recomputedFlag(check.outcome),
      }),
      outcome: check.outcome,
      toleranceJson: JSON.stringify({
        method: check.kind,
        granularity: "1/(n*items)",
        engine: "scrutiny",
      }),
    },
    item: {
      checkKind: check.kind,
      outcome: check.outcome,
      claimText,
      detail:
        check.outcome === "consistent"
          ? `${check.kind.toUpperCase()} consistent`
          : check.outcome === "discrepant"
            ? `${check.kind.toUpperCase()} inconsistent: reported values are not arithmetically possible`
            : `${check.kind.toUpperCase()} not computable`,
    },
  };
}

function powerCheckToClassified(check: PowerCheck): ClassifiedCheck {
  const claimText = `${check.label}: ${check.test ?? "?"}, N = ${check.n ?? "?"}, effect = ${check.effectSize ?? "?"}`;
  return {
    persist: {
      checkKind: "power",
      claimText,
      reportedJson: JSON.stringify({
        test: check.test,
        n: check.n,
        effectSize: check.effectSize,
        alpha: check.alpha,
      }),
      recomputedJson: JSON.stringify({
        power: check.power,
        adequate: check.adequate,
        adequacyThreshold: POWER_ADEQUACY_THRESHOLD,
      }),
      outcome: check.outcome,
      toleranceJson: JSON.stringify({
        method: "prospective_power",
        adequacyThreshold: POWER_ADEQUACY_THRESHOLD,
        engine: "pwr",
      }),
    },
    item: {
      checkKind: "power",
      outcome: check.outcome,
      claimText,
      detail:
        check.power == null
          ? "power not computable"
          : `power = ${check.power.toFixed(2)} to detect the pre-specified effect at this N${check.adequate === false ? " (below the conventional .80)" : ""}`,
    },
  };
}

// A check worth surfacing: anything not plainly consistent, plus prospective
// power that falls below the conventional adequacy threshold.
function isNotable(check: ClassifiedCheck, powerAdequate: Map<string, boolean | null>): boolean {
  if (check.item.outcome !== "consistent") return true;
  if (check.item.checkKind === "power") {
    return powerAdequate.get(check.item.claimText) === false;
  }
  return false;
}

// Shared env + gate prologue for every sandbox compute task. Resolves the
// snapshot/apiKey, and (unless serviceMode) runs the fan-out rate gate then the
// flat sandbox_compute credit gate, consuming the rate token only after the credit
// succeeds. Returns the resolved env + creditsCharged on success, or the block to
// return verbatim. Behaviour-preserving extraction of the former stat prologue.
type SandboxGate =
  | { ok: true; snapshot: string; apiKey: string; creditsCharged: number }
  | { ok: false; block: SandboxGateBlock };

async function gateSandboxCompute(
  ctx: ActionCtx,
  args: {
    ownerUserId: string;
    threadId?: string;
    runId?: Id<"agentRuns">;
    artifactId: Id<"artifacts">;
    taskKind: "stat_verification" | "meta_analysis";
    serviceMode?: boolean;
  },
): Promise<SandboxGate> {
  const snapshot = process.env.DAYTONA_STATVERIFY_SNAPSHOT;
  const apiKey = process.env.DAYTONA_API_KEY;
  if (!snapshot || !apiKey) {
    return { ok: false, block: { status: "not_configured" } };
  }

  // Service mode (the deep-research auto stat pass) skips the per-user
  // sandbox_compute charge + fan-out gate — the parent deep_research run already
  // billed the user. Interactive paths (verifyStatistics / runComputation) keep
  // the gate.
  if (!args.serviceMode) {
    // Fan-out gate first (cheap, fail fast) — don't charge a credit if the user
    // is already over their per-minute sandbox budget.
    const rate = await rateLimiter.check(ctx, "sandboxComputePerUser", {
      key: args.ownerUserId,
    });
    if (!rate.ok) {
      return { ok: false, block: { status: "rate_limited", retryAfterMs: rate.retryAfter } };
    }

    // Monthly credit gate. sandbox_compute is a flat per-run charge (see catalog).
    const billing = await ctx.runMutation(
      internal.billing.entitlements.consumeCreditsInternal,
      {
        ownerUserId: args.ownerUserId,
        feature: "sandbox_compute",
        provider: SANDBOX_PROVIDER,
        threadId: args.threadId,
        runId: args.runId,
        metadataJson: JSON.stringify({
          taskKind: args.taskKind,
          artifactId: args.artifactId,
        }),
      },
    );
    if (!billing.ok) {
      return {
        ok: false,
        block: {
          status: "quota_blocked",
          reason: billing.reason,
          requiredPlan: billing.requiredPlan,
        },
      };
    }
    // Consume the fan-out token only after the credit succeeds.
    await rateLimiter.limit(ctx, "sandboxComputePerUser", {
      key: args.ownerUserId,
    });
  }

  const creditsCharged = args.serviceMode
    ? 0
    : estimateCredits({ feature: "sandbox_compute" });
  return { ok: true, snapshot, apiKey, creditsCharged };
}

export async function runStatVerificationFlow(
  ctx: ActionCtx,
  args: {
    ownerUserId: string;
    threadId?: string;
    runId?: Id<"agentRuns">;
    artifactId: Id<"artifacts">;
    text: string;
    serviceMode?: boolean;
  },
): Promise<StatVerificationResult> {
  const gate = await gateSandboxCompute(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    runId: args.runId,
    artifactId: args.artifactId,
    taskKind: "stat_verification",
    serviceMode: args.serviceMode,
  });
  if (!gate.ok) return gate.block;
  const { snapshot, apiKey, creditsCharged } = gate;
  const startedAt = Date.now();
  const sandboxRunId: Id<"sandboxRuns"> = await ctx.runMutation(
    internal.agent.sandbox.records.startSandboxRun,
    {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      taskKind: "stat_verification",
      snapshotVersion: snapshot,
      command: STATCHECK_COMMAND,
      inputFileHashes: [sha256Hex(args.text)],
      creditsCharged,
    },
  );

  try {
    // Extract GRIM/power claims (best-effort; statcheck needs no extraction).
    const claims = await extractVerificationClaims(args.text);

    const files = [
      { path: STATCHECK_SCRIPT_PATH, content: STATCHECK_R },
      { path: STATCHECK_INPUT_PATH, content: args.text },
    ];
    const commands = [
      { key: "statcheck", command: STATCHECK_COMMAND, cwd: "/workspace" },
    ];
    if (claims.grimClaims.length > 0) {
      files.push(
        { path: GRIM_SCRIPT_PATH, content: GRIM_R },
        { path: GRIM_CLAIMS_PATH, content: JSON.stringify(claims.grimClaims) },
      );
      commands.push({ key: "grim", command: GRIM_COMMAND, cwd: "/workspace" });
    }
    if (claims.powerClaims.length > 0) {
      files.push(
        { path: POWER_SCRIPT_PATH, content: POWER_R },
        { path: POWER_CLAIMS_PATH, content: JSON.stringify(claims.powerClaims) },
      );
      commands.push({ key: "power", command: POWER_COMMAND, cwd: "/workspace" });
    }

    const results = await runSandboxSession({
      apiKey,
      snapshot,
      files,
      commands,
      timeoutSeconds: VERIFICATION_TIMEOUT_SECONDS,
    });

    const statcheckResult = resultByKey(results, "statcheck");
    const grimResult = resultByKey(results, "grim");
    const powerResult = resultByKey(results, "power");

    const checks: ClassifiedCheck[] = [
      ...statcheckChecks(statcheckResult?.stdout ?? ""),
      ...(grimResult
        ? parseGrimStdout(grimResult.stdout)
            .flatMap(classifyGrimRow)
            .map(grimCheckToClassified)
        : []),
      ...(powerResult
        ? parsePowerStdout(powerResult.stdout)
            .map(classifyPowerRow)
            .map(powerCheckToClassified)
        : []),
    ];

    const timedOut = Boolean(statcheckResult?.timedOut);
    await ctx.runMutation(internal.agent.sandbox.records.completeSandboxRun, {
      ownerUserId: args.ownerUserId,
      sandboxRunId,
      status: timedOut ? "timeout" : "completed",
      exitCode: statcheckResult?.exitCode,
      stdoutClipped: clip(statcheckResult?.stdout ?? "", STDOUT_CLIP_CHARS),
      durationMs: Date.now() - startedAt,
    });

    if (checks.length > 0) {
      await ctx.runMutation(
        internal.agent.sandbox.records.insertComputationChecks,
        {
          ownerUserId: args.ownerUserId,
          sandboxRunId,
          artifactId: args.artifactId,
          checks: checks.map((check) => check.persist),
        },
      );
    }

    const report = buildVerificationReport({
      artifactId: args.artifactId,
      runFailed: false,
      sandboxRunIds: [sandboxRunId],
      checks: checks.map((check) => ({
        checkKind: check.persist.checkKind,
        outcome: check.persist.outcome,
      })),
    });

    // Persist the report + observability event when this verification belongs
    // to a tracked agent run.
    if (args.runId && args.threadId) {
      await ctx.runMutation(
        internal.agent.sandbox.records.persistVerificationReport,
        {
          ownerUserId: args.ownerUserId,
          runId: args.runId,
          verificationReportJson: JSON.stringify(report),
        },
      );
      await ctx.runMutation(internal.agent.sandbox.records.recordComputeEvent, {
        ownerUserId: args.ownerUserId,
        runId: args.runId,
        threadId: args.threadId,
        title: `Verifikasi statistik: ${report.verdict}`,
        summary: `${report.statistics.checked} pemeriksaan — ${report.statistics.consistent} konsisten, ${report.statistics.discrepant} tidak rekonsiliasi, ${report.statistics.decisionErrors} perbedaan keputusan`,
        metadataJson: JSON.stringify({ sandboxRunId, verdict: report.verdict }),
      });
    }

    const powerAdequate = new Map<string, boolean | null>();
    for (const check of checks) {
      if (check.item.checkKind === "power") {
        const parsed = JSON.parse(check.persist.recomputedJson) as {
          adequate?: boolean | null;
        };
        powerAdequate.set(check.item.claimText, parsed.adequate ?? null);
      }
    }

    return {
      status: "completed",
      sandboxRunId,
      verdict: report.verdict,
      summary: report.statistics,
      byKind: report.byKind,
      items: checks
        .filter((check) => isNotable(check, powerAdequate))
        .slice(0, 30)
        .map((check) => check.item),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await ctx.runMutation(internal.agent.sandbox.records.completeSandboxRun, {
      ownerUserId: args.ownerUserId,
      sandboxRunId,
      status: "failed",
      errorMessage: clip(errorMessage, ERROR_CLIP_CHARS),
      durationMs: Date.now() - startedAt,
    });
    return { status: "failed", sandboxRunId, errorMessage };
  }
}

export const runStatVerification = internalAction({
  args: {
    ownerUserId: v.string(),
    threadId: v.optional(v.string()),
    runId: v.optional(v.id("agentRuns")),
    artifactId: v.id("artifacts"),
    text: v.string(),
    serviceMode: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<StatVerificationResult> => {
    return await runStatVerificationFlow(ctx, args);
  },
});

// Decode a base64 plot read back from the sandbox and store it as a PNG blob,
// returning the storageId (or null when the plot was not produced).
async function storePlot(
  ctx: ActionCtx,
  base64: string | undefined,
): Promise<Id<"_storage"> | null> {
  const trimmed = (base64 ?? "").trim();
  if (!trimmed) return null;
  try {
    const bytes = Buffer.from(trimmed, "base64");
    if (bytes.length === 0) return null;
    const blob = new Blob([bytes], { type: "image/png" });
    return await ctx.storage.store(blob);
  } catch {
    return null;
  }
}

export async function runMetaAnalysisFlow(
  ctx: ActionCtx,
  args: {
    ownerUserId: string;
    threadId?: string;
    runId?: Id<"agentRuns">;
    artifactId: Id<"artifacts">;
    text: string;
    serviceMode?: boolean;
  },
): Promise<MetaAnalysisRunResult> {
  const gate = await gateSandboxCompute(ctx, {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    runId: args.runId,
    artifactId: args.artifactId,
    taskKind: "meta_analysis",
    serviceMode: args.serviceMode,
  });
  if (!gate.ok) return gate.block;
  const { snapshot, apiKey, creditsCharged } = gate;
  const startedAt = Date.now();

  // Extract study-level effect sizes from the artifact (best-effort, no egress).
  const studies = await extractMetaStudies(args.text);
  const studiesJson = JSON.stringify(studies);

  const sandboxRunId: Id<"sandboxRuns"> = await ctx.runMutation(
    internal.agent.sandbox.records.startSandboxRun,
    {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      runId: args.runId,
      taskKind: "meta_analysis",
      snapshotVersion: snapshot,
      command: META_COMMAND,
      inputFileHashes: [sha256Hex(studiesJson)],
      creditsCharged,
    },
  );

  try {
    // Fewer than two pooled studies → nothing to meta-analyze; record an honest
    // summary without provisioning a sandbox.
    if (studies.length < 2) {
      const summary: MetaAnalysisResult = {
        status: "insufficient_studies",
        k: studies.length,
      };
      await ctx.runMutation(internal.agent.sandbox.records.completeSandboxRun, {
        ownerUserId: args.ownerUserId,
        sandboxRunId,
        status: "completed",
        metaAnalysisJson: JSON.stringify(summary),
        durationMs: Date.now() - startedAt,
      });
      return {
        status: "completed",
        sandboxRunId,
        summary,
        heterogeneity: null,
        publicationBiasSignal: false,
      };
    }

    const results = await runSandboxSession({
      apiKey,
      snapshot,
      files: [
        { path: META_SCRIPT_PATH, content: META_R },
        { path: META_STUDIES_PATH, content: studiesJson },
      ],
      commands: [
        { key: "meta", command: META_COMMAND, cwd: "/workspace" },
        { key: "forest", command: META_FOREST_READ_COMMAND, cwd: "/workspace" },
        { key: "funnel", command: META_FUNNEL_READ_COMMAND, cwd: "/workspace" },
      ],
      timeoutSeconds: VERIFICATION_TIMEOUT_SECONDS,
    });

    const metaResult = resultByKey(results, "meta");
    const summary = parseMetaStdout(metaResult?.stdout ?? "");
    if (!summary) {
      throw new Error("meta-analysis produced no parseable output");
    }

    // Read back the plots (empty base64 when not produced) and store as blobs.
    const [forestStorageId, funnelStorageId] = await Promise.all([
      storePlot(ctx, resultByKey(results, "forest")?.stdout),
      storePlot(ctx, resultByKey(results, "funnel")?.stdout),
    ]);

    const timedOut = Boolean(metaResult?.timedOut);
    const persisted = { ...summary, forestStorageId, funnelStorageId };
    await ctx.runMutation(internal.agent.sandbox.records.completeSandboxRun, {
      ownerUserId: args.ownerUserId,
      sandboxRunId,
      status: timedOut ? "timeout" : "completed",
      exitCode: metaResult?.exitCode,
      stdoutClipped: clip(metaResult?.stdout ?? "", STDOUT_CLIP_CHARS),
      metaAnalysisJson: JSON.stringify(persisted),
      durationMs: Date.now() - startedAt,
    });

    const heterogeneity =
      summary.status === "ok" ? describeHeterogeneity(summary.i2) : null;
    const publicationBiasSignal =
      summary.status === "ok" ? suggestsPublicationBias(summary) : false;

    if (args.runId && args.threadId) {
      const headline =
        summary.status === "ok"
          ? `k=${summary.k}, estimasi gabungan ${summary.pooledEstimate.toFixed(3)} (I²=${summary.i2.toFixed(0)}%)`
          : `tidak dapat menggabungkan (${summary.status}, k=${summary.k})`;
      await ctx.runMutation(internal.agent.sandbox.records.recordComputeEvent, {
        ownerUserId: args.ownerUserId,
        runId: args.runId,
        threadId: args.threadId,
        title: "Meta-analisis",
        summary: headline,
        metadataJson: JSON.stringify({ sandboxRunId, status: summary.status }),
      });
    }

    return {
      status: "completed",
      sandboxRunId,
      summary,
      heterogeneity,
      publicationBiasSignal,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await ctx.runMutation(internal.agent.sandbox.records.completeSandboxRun, {
      ownerUserId: args.ownerUserId,
      sandboxRunId,
      status: "failed",
      errorMessage: clip(errorMessage, ERROR_CLIP_CHARS),
      durationMs: Date.now() - startedAt,
    });
    return { status: "failed", sandboxRunId, errorMessage };
  }
}

// Single dispatcher the approval-gated runComputation tool calls: routes by
// taskKind to the matching flow and tags the result so the tool can shape a
// neutral, task-specific message. stat_verification keeps its own direct action
// (runStatVerification) for the auto verifyStatistics path.
export const runComputation = internalAction({
  args: {
    ownerUserId: v.string(),
    threadId: v.optional(v.string()),
    runId: v.optional(v.id("agentRuns")),
    artifactId: v.id("artifacts"),
    text: v.string(),
    taskKind: v.union(v.literal("stat_verification"), v.literal("meta_analysis")),
  },
  handler: async (ctx, args): Promise<SandboxComputeResult> => {
    if (args.taskKind === "meta_analysis") {
      const result = await runMetaAnalysisFlow(ctx, args);
      return { kind: "meta_analysis", ...result };
    }
    const result = await runStatVerificationFlow(ctx, args);
    return { kind: "stat_verification", ...result };
  },
});
