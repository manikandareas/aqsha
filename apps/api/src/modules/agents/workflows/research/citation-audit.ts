import type { CitationAuditResult, SynthesisResult } from "./schemas";

export function auditCitations(synthesis: SynthesisResult): CitationAuditResult {
  const evidenceKeys = new Set(
    synthesis.evidenceItems.map((item) => item.citationKey),
  );
  const warnings: string[] = [];
  const failures: string[] = [];

  for (const claim of synthesis.claims) {
    if (!claim.supported) {
      warnings.push(`Unsupported claim: ${claim.text}`);
      continue;
    }

    if (claim.citationKeys.length === 0) {
      failures.push(`Supported claim has no citations: ${claim.text}`);
      continue;
    }

    const missingKeys = claim.citationKeys.filter((key) => !evidenceKeys.has(key));

    if (missingKeys.length > 0) {
      failures.push(
        `Claim cites missing evidence (${missingKeys.join(", ")}): ${claim.text}`,
      );
    }
  }

  const supportedClaimCount = synthesis.claims.filter(
    (claim) =>
      claim.supported &&
      claim.citationKeys.length > 0 &&
      claim.citationKeys.every((key) => evidenceKeys.has(key)),
  ).length;

  if (supportedClaimCount === 0) {
    failures.push("No supported claims survived citation audit.");
  }

  return {
    passed: failures.length === 0,
    warnings,
    failures,
    supportedClaimCount,
  };
}
