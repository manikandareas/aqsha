// Sandbox abstraction for statistical verification (plan §5.6 / Phase 4). The
// tool surface stays stable; the real Daytona engine lives in `src/sandbox/`
// (statcheck/GRIM/GRIMMER/power + metafor R scripts, LLM claim extraction, and
// the deterministic classify→report pipeline). When the Daytona credentials are
// missing the service reports not_configured and the model communicates that
// honestly. Gating (rate limit / billing) is NOT here — it stays in Convex.

import {
  runMetaAnalysisFlow,
  runStatVerificationFlow,
  type EngineDeps,
  type SandboxVendor,
} from "../sandbox/engine";
import {
  createAnthropicJsonClient,
  nullJsonLlmClient,
  type JsonLlmClient,
} from "../sandbox/llmExtract";
import { runSandboxSession } from "../sandbox/sandboxVendor";

export type SandboxVerdict = "passed" | "passed_with_notes" | "needs_review" | "failed";

export type SandboxVerificationResult = {
  status: "completed" | "not_configured" | "failed";
  verdict?: SandboxVerdict;
  summary?: string;
  items?: Array<Record<string, unknown>>;
  reason?: string;
};

export type ComputationResult = {
  status: "completed" | "not_configured" | "failed";
  summary?: string;
  outputJson?: string;
  reason?: string;
};

export interface SandboxService {
  verifyStatistics(input: {
    ownerUserId: string;
    runId: string;
    artifactText: string;
  }): Promise<SandboxVerificationResult>;
  runComputation(input: {
    ownerUserId: string;
    runId: string;
    computationKind: string;
    artifactText?: string;
    prompt?: string;
  }): Promise<ComputationResult>;
}

export class NotConfiguredSandboxService implements SandboxService {
  constructor(private readonly reason: string) {}

  async verifyStatistics(): Promise<SandboxVerificationResult> {
    return { status: "not_configured", reason: this.reason };
  }

  async runComputation(): Promise<ComputationResult> {
    return { status: "not_configured", reason: this.reason };
  }
}

// Model used for best-effort claim extraction when the caller injects none.
// Mirrors the config default lite tier (D6).
const DEFAULT_EXTRACTION_MODEL = "claude-haiku-4-5";

class DaytonaSandboxService implements SandboxService {
  constructor(private readonly deps: EngineDeps) {}

  async verifyStatistics(input: {
    ownerUserId: string;
    runId: string;
    artifactText: string;
  }): Promise<SandboxVerificationResult> {
    const result = await runStatVerificationFlow(this.deps, {
      artifactText: input.artifactText,
    });
    if (result.status === "failed") {
      return { status: "failed", reason: result.reason };
    }
    const s = result.summary;
    return {
      status: "completed",
      verdict: result.verdict,
      summary: `${s.checked} checks — ${s.consistent} consistent, ${s.discrepant} discrepant, ${s.decisionErrors} decision errors, ${s.notComputable} not computable`,
      items: result.items.map((item) => ({ ...item })),
    };
  }

  async runComputation(input: {
    ownerUserId: string;
    runId: string;
    computationKind: string;
    artifactText?: string;
    prompt?: string;
  }): Promise<ComputationResult> {
    const artifactText = input.artifactText ?? "";
    if (input.computationKind === "stat_verification") {
      const result = await runStatVerificationFlow(this.deps, {
        artifactText,
        prompt: input.prompt,
      });
      if (result.status === "failed") {
        return { status: "failed", reason: result.reason };
      }
      return {
        status: "completed",
        summary: `Statistical verification verdict: ${result.verdict}`,
        outputJson: result.reportJson,
      };
    }
    if (input.computationKind === "meta_analysis") {
      const result = await runMetaAnalysisFlow(this.deps, {
        artifactText,
        prompt: input.prompt,
      });
      if (result.status === "failed") {
        return { status: "failed", reason: result.reason };
      }
      if (result.status === "insufficient_studies") {
        return {
          status: "completed",
          summary:
            "Fewer than two studies with complete effect-size data could be extracted, so no pooled estimate was computed.",
          outputJson: JSON.stringify({ status: "insufficient_studies" }),
        };
      }
      return {
        status: "completed",
        summary:
          result.summary.status === "ok"
            ? `Pooled ${result.summary.measure} estimate ${result.summary.pooledEstimate.toFixed(3)} across k=${result.summary.k} studies (I²=${result.summary.i2.toFixed(0)}%)`
            : `Could not pool studies (${result.summary.status}, k=${result.summary.k})`,
        outputJson: result.outputJson,
      };
    }
    return {
      status: "not_configured",
      reason: `Computation kind "${input.computationKind}" is not available at the current sandbox tier.`,
    };
  }
}

export interface BuildSandboxServiceOptions {
  daytonaApiKey?: string;
  /** Pre-baked snapshot name; falls back to DAYTONA_STATVERIFY_SNAPSHOT. */
  snapshot?: string;
  /** Anthropic-compatible base URL for claim extraction; falls back to ANTHROPIC_BASE_URL. */
  anthropicBaseUrl?: string;
  /** Falls back to ANTHROPIC_API_KEY. */
  anthropicApiKey?: string;
  /** Falls back to ANTHROPIC_AUTH_TOKEN (gateway auth). */
  anthropicAuthToken?: string;
  /** Model id for the best-effort claim extraction. */
  extractionModel?: string;
  /** Test seams. */
  vendor?: SandboxVendor;
  llm?: JsonLlmClient;
  log?: (message: string) => void;
}

export function buildSandboxService(
  env: BuildSandboxServiceOptions,
): SandboxService {
  if (!env.daytonaApiKey) {
    return new NotConfiguredSandboxService(
      "Statistical verification sandbox is not configured (DAYTONA_API_KEY missing).",
    );
  }
  // The runManager call site passes only { daytonaApiKey }; the remaining
  // engine settings fall back to the same env vars config.ts reads.
  const snapshot =
    env.snapshot ?? process.env.DAYTONA_STATVERIFY_SNAPSHOT?.trim() ?? "";
  if (!snapshot) {
    return new NotConfiguredSandboxService(
      "Statistical verification sandbox is not configured (DAYTONA_STATVERIFY_SNAPSHOT missing).",
    );
  }

  const anthropicApiKey =
    env.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY?.trim() ?? undefined;
  const anthropicAuthToken =
    env.anthropicAuthToken ?? process.env.ANTHROPIC_AUTH_TOKEN?.trim() ?? undefined;
  const anthropicBaseUrl =
    env.anthropicBaseUrl ??
    process.env.ANTHROPIC_BASE_URL?.trim() ??
    "https://api.anthropic.com";

  // Claim extraction is best-effort: without LLM auth the GRIM/power/meta
  // extraction yields nothing and statcheck still runs on raw text.
  const llm =
    env.llm ??
    (anthropicApiKey || anthropicAuthToken
      ? createAnthropicJsonClient({
          baseUrl: anthropicBaseUrl,
          apiKey: anthropicApiKey,
          authToken: anthropicAuthToken,
        })
      : nullJsonLlmClient);

  return new DaytonaSandboxService({
    vendor: env.vendor ?? runSandboxSession,
    llm,
    config: {
      apiKey: env.daytonaApiKey,
      snapshot,
      model: env.extractionModel ?? DEFAULT_EXTRACTION_MODEL,
    },
    log: env.log,
  });
}
