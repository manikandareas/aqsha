// Sandbox abstraction for statistical verification (plan §5.6 / Phase 4).
// The tool surface ships now so prompts, gating, and events are stable; the
// Daytona engine port (statcheck/GRIM/GRIMMER/power R scripts + claim
// extraction) is the Phase 4 work item. Until then the default implementation
// reports not_configured and the model communicates that honestly.

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

export function buildSandboxService(env: {
  daytonaApiKey?: string;
}): SandboxService {
  if (!env.daytonaApiKey) {
    return new NotConfiguredSandboxService(
      "Statistical verification sandbox is not configured (DAYTONA_API_KEY missing).",
    );
  }
  // Daytona engine port lands in Phase 4; the key being present does not make
  // the engine available yet.
  return new NotConfiguredSandboxService(
    "Statistical verification engine has not been ported to this service yet (Phase 4).",
  );
}
