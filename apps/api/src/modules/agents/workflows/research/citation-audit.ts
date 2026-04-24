import type {
  CitationAuditResult,
  Claim,
  EvidenceItem,
  SynthesisResult,
} from "./schemas";

/**
 * Deterministic citation audit (design v2 §12).
 *
 * Enforces the grounding chain `researcher evidence → critic supports →
 * synthesizer cites`. Inputs come from the persisted pools, not from the
 * synthesizer's own output, so the synthesizer cannot self-certify its
 * citations.
 *
 * @param input.claims          The critic's persisted claim pool (latest iteration).
 * @param input.evidencePool    The researcher's persisted evidence pool (across all iterations).
 * @param input.synthesis       The synthesizer output (provides `claimIdsUsed`).
 */
export function auditCitations(input: {
  claims: Claim[];
  evidencePool: EvidenceItem[];
  synthesis: SynthesisResult;
}): CitationAuditResult {
  const claimById = new Map(input.claims.map((claim) => [claim.claimId, claim]));
  const evidenceIds = new Set(
    input.evidencePool.map((item) => item.evidenceId),
  );
  const warnings: string[] = [];
  const failures: string[] = [];
  let supportedClaimCount = 0;

  for (const claimId of input.synthesis.claimIdsUsed) {
    const claim = claimById.get(claimId);

    if (!claim) {
      failures.push(`Unknown claim id cited by synthesizer: ${claimId}`);
      continue;
    }

    if (!claim.supported) {
      failures.push(
        `Unsupported claim used by synthesizer: ${claimId} (${claim.statement})`,
      );
      continue;
    }

    if (claim.evidenceIds.length === 0) {
      failures.push(
        `Supported claim has no evidence references: ${claimId} (${claim.statement})`,
      );
      continue;
    }

    const missing = claim.evidenceIds.filter((id) => !evidenceIds.has(id));

    if (missing.length > 0) {
      failures.push(
        `Claim ${claimId} references missing evidence (${missing.join(", ")}): ${claim.statement}`,
      );
      continue;
    }

    if (claim.confidence === "low") {
      warnings.push(
        `Low-confidence claim used: ${claimId} (${claim.statement})`,
      );
    }

    supportedClaimCount += 1;
  }

  if (supportedClaimCount === 0 && input.synthesis.claimIdsUsed.length > 0) {
    failures.push("No supported claims survived citation audit.");
  }

  return {
    passed: failures.length === 0,
    warnings,
    failures,
    supportedClaimCount,
  };
}
