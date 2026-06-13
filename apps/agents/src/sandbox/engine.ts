// Statistical-verification engine: the orchestration flows ported from the
// legacy Convex `sandboxRunner.ts`, decoupled from Convex. Gating (rate limit /
// billing) stays in Convex; provenance records and plot blob storage are not
// ported (plot base64 is returned on the result instead, see the meta flow).
// What IS preserved exactly: LLM claim extraction (best-effort) → ONE ephemeral
// sandbox running statcheck + GRIM + power (or metafor) → deterministic
// classification under explicit tolerances → the pure verification report. The
// sandbox itself is always torn down in the vendor's `finally`.

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
import type {
  SandboxCommandResult,
  SandboxSessionRequest,
} from "./sandboxVendor";
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
import type { JsonLlmClient } from "./llmExtract";

const VERIFICATION_TIMEOUT_SECONDS = 90;

// The vendor is injected as the session function itself so tests can fake an
// entire sandbox run with canned stdout per command key.
export type SandboxVendor = (
  req: SandboxSessionRequest,
) => Promise<SandboxCommandResult[]>;

export interface EngineDeps {
  vendor: SandboxVendor;
  llm: JsonLlmClient;
  config: {
    /** Daytona API key, threaded into the session request. */
    apiKey: string;
    /** Pre-baked snapshot name (e.g. "aqsha-statverify-v1"). */
    snapshot: string;
    /** Model id used for the best-effort claim extraction. */
    model: string;
  };
  log?: (message: string) => void;
}

export interface EngineInput {
  artifactText: string;
  /** Optional user prompt; included in the extraction text (e.g. study tables pasted in chat). */
  prompt?: string;
}

export interface VerificationCheckItem {
  checkKind: ComputationCheckKind;
  outcome: ComputationOutcome;
  claimText: string;
  detail: string;
}

export type StatVerificationFlowResult =
  | {
      status: "completed";
      verdict: VerificationVerdict;
      summary: OutcomeSummary;
      byKind: Record<ComputationCheckKind, OutcomeSummary>;
      items: VerificationCheckItem[];
      /** The full pure verification report, serialized. */
      reportJson: string;
    }
  | { status: "failed"; reason: string };

export type MetaAnalysisFlowResult =
  | {
      status: "completed";
      summary: MetaAnalysisResult;
      /** Summary + heterogeneity/publication-bias interpretation, serialized. */
      outputJson: string;
      /** Base64 PNG plots read back from the sandbox; undefined when not produced. */
      forestPngBase64?: string;
      funnelPngBase64?: string;
    }
  | { status: "insufficient_studies" }
  | { status: "failed"; reason: string };

// One classified check: the compact response item plus the power-adequacy flag
// needed by the notability filter.
interface ClassifiedCheck {
  item: VerificationCheckItem;
  powerAdequate?: boolean | null;
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
  return parseStatcheckStdout(stdout).map((row) => {
    const outcome = classifyStatcheckRow(row, tolerance);
    return {
      item: {
        checkKind: "statcheck",
        outcome,
        claimText: buildClaimText(row),
        detail: `reported p ${row.reportedComparison} ${fmtP(row.reportedPValue)} vs recomputed p = ${fmtP(row.computedPValue)}`,
      },
    };
  });
}

function grimCheckToClassified(check: GrimCheck): ClassifiedCheck {
  const sdPart = check.sd != null ? `, SD = ${check.sd}` : "";
  const itemsPart =
    check.items != null && check.items > 1 ? `, ${check.items} item` : "";
  const claimText = `${check.label}: M = ${check.mean ?? "?"}${sdPart}, N = ${check.n ?? "?"}${itemsPart}`;
  return {
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
    item: {
      checkKind: "power",
      outcome: check.outcome,
      claimText,
      detail:
        check.power == null
          ? "power not computable"
          : `power = ${check.power.toFixed(2)} to detect the pre-specified effect at this N${check.adequate === false ? " (below the conventional .80)" : ""}`,
    },
    powerAdequate: check.adequate,
  };
}

// A check worth surfacing: anything not plainly consistent, plus prospective
// power that falls below the conventional adequacy threshold.
function isNotable(check: ClassifiedCheck): boolean {
  if (check.item.outcome !== "consistent") return true;
  if (check.item.checkKind === "power") return check.powerAdequate === false;
  return false;
}

function extractionText(input: EngineInput): string {
  return input.prompt
    ? `${input.prompt.trim()}\n\n${input.artifactText}`
    : input.artifactText;
}

export async function runStatVerificationFlow(
  deps: EngineDeps,
  input: EngineInput,
): Promise<StatVerificationFlowResult> {
  const { vendor, llm, config, log } = deps;
  try {
    // Extract GRIM/power claims (best-effort; statcheck needs no extraction).
    const claims = await extractVerificationClaims(
      extractionText(input),
      llm,
      config.model,
    );
    log?.(
      `stat verification: ${claims.grimClaims.length} GRIM claims, ${claims.powerClaims.length} power claims extracted`,
    );

    const files = [
      { path: STATCHECK_SCRIPT_PATH, content: STATCHECK_R },
      { path: STATCHECK_INPUT_PATH, content: input.artifactText },
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

    const results = await vendor({
      apiKey: config.apiKey,
      snapshot: config.snapshot,
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

    const report = buildVerificationReport({
      artifactId: "artifact",
      runFailed: false,
      sandboxRunIds: [],
      checks: checks.map((check) => ({
        checkKind: check.item.checkKind,
        outcome: check.item.outcome,
      })),
    });

    return {
      status: "completed",
      verdict: report.verdict,
      summary: report.statistics,
      byKind: report.byKind,
      items: checks.filter(isNotable).slice(0, 30).map((check) => check.item),
      reportJson: JSON.stringify(report),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log?.(`stat verification failed: ${reason}`);
    return { status: "failed", reason };
  }
}

export async function runMetaAnalysisFlow(
  deps: EngineDeps,
  input: EngineInput,
): Promise<MetaAnalysisFlowResult> {
  const { vendor, llm, config, log } = deps;
  try {
    // Extract study-level effect sizes from the artifact (best-effort, no egress).
    const studies = await extractMetaStudies(
      extractionText(input),
      llm,
      config.model,
    );
    log?.(`meta-analysis: ${studies.length} studies extracted`);

    // Fewer than two pooled studies → nothing to meta-analyze; surface an
    // honest result without provisioning a sandbox.
    if (studies.length < 2) {
      return { status: "insufficient_studies" };
    }

    const studiesJson = JSON.stringify(studies);
    const results = await vendor({
      apiKey: config.apiKey,
      snapshot: config.snapshot,
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

    const heterogeneity =
      summary.status === "ok" ? describeHeterogeneity(summary.i2) : null;
    const publicationBiasSignal =
      summary.status === "ok" ? suggestsPublicationBias(summary) : false;

    const forest = resultByKey(results, "forest")?.stdout.trim() || undefined;
    const funnel = resultByKey(results, "funnel")?.stdout.trim() || undefined;

    return {
      status: "completed",
      summary,
      outputJson: JSON.stringify({
        ...summary,
        heterogeneity,
        publicationBiasSignal,
        forestPlotAvailable: Boolean(forest),
        funnelPlotAvailable: Boolean(funnel),
      }),
      forestPngBase64: forest,
      funnelPngBase64: funnel,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log?.(`meta-analysis failed: ${reason}`);
    return { status: "failed", reason };
  }
}
