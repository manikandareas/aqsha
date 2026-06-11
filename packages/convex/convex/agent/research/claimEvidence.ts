// Pure, Convex-free helpers for the Module-3 auditor (Phase 3, Slice 3.2):
// linking deterministic sandbox recomputations to a report's textual claims,
// resolving the evidence kind, bounding the verifier batch concurrency, and the
// agentic-RAG enforcement gate. No Convex registrations and no model/sandbox IO,
// so the logic is unit-testable in isolation (claimEvidence.test.ts).

import type { ComputationOutcome } from "../sandbox/computationOutcome";

export type EvidenceKind = "textual" | "computational" | "mixed";

// A run's computationChecks row reduced to what the matcher needs (no bulk
// reportedJson/recomputedJson crosses this boundary — IDs + small spans only).
export interface ComputationRef {
  computationCheckId: string;
  claimSpan?: string;
  claimText: string;
  outcome: ComputationOutcome;
}

export interface ClaimComputationLink {
  computationCheckIds: string[];
  /** The matched NHST span (for UI highlight), from the first linked check. */
  claimSpan?: string;
  /** A linked check recomputed CONSISTENT — strictly stronger than a citation. */
  matchedConsistent: boolean;
  /** A linked check is discrepant / decision_error — flagged, never auto-fraud. */
  matchedAdverse: boolean;
}

// Normalize an NHST string so "t(28) = 2.10, p = .04" matches "t(28)=2.10,p=.04"
// regardless of spacing around operators/parens. Lowercased, whitespace removed.
function normalizeStat(text: string): string {
  return (text ?? "").toLowerCase().replace(/\s+/g, "");
}

/**
 * Deterministically link a textual claim to the sandbox recomputations that
 * back it: a computation matches when its NHST span (or claimText, normalized)
 * appears inside the claim text. Pure — no model call.
 */
export function linkComputationToClaim(
  claimText: string,
  computations: ComputationRef[],
): ClaimComputationLink {
  const haystack = normalizeStat(claimText);
  const ids: string[] = [];
  let claimSpan: string | undefined;
  let matchedConsistent = false;
  let matchedAdverse = false;
  for (const comp of computations) {
    const span = comp.claimSpan ?? comp.claimText;
    const needle = normalizeStat(span);
    if (needle.length < 4 || !haystack.includes(needle)) continue;
    ids.push(comp.computationCheckId);
    if (claimSpan === undefined) claimSpan = comp.claimSpan ?? comp.claimText;
    if (comp.outcome === "consistent") matchedConsistent = true;
    if (comp.outcome === "discrepant" || comp.outcome === "decision_error") {
      matchedAdverse = true;
    }
  }
  return { computationCheckIds: ids, claimSpan, matchedConsistent, matchedAdverse };
}

/** Evidence provenance: a textual extract, a sandbox recompute, or both. */
export function resolveEvidenceKind(args: {
  hasExtract: boolean;
  hasComputation: boolean;
}): EvidenceKind {
  if (args.hasComputation && args.hasExtract) return "mixed";
  if (args.hasComputation) return "computational";
  return "textual";
}

// The patch a citationCheck receives from its computation linkage. `support` is
// only ever upgraded to "supported" (a consistent recompute beats a citation);
// an adverse computation is recorded but never auto-downgrades the claim here
// (a numeric discrepancy is not fraud — neutral by construction).
export interface CitationEvidencePatch {
  support?: "supported";
  confidence?: number;
  evidenceKind: EvidenceKind;
  computationCheckIds?: string[];
  claimSpan?: string;
}

export function computeEvidencePatch(
  link: ClaimComputationLink,
  hasExtract: boolean,
): CitationEvidencePatch {
  const hasComputation = link.computationCheckIds.length > 0;
  const patch: CitationEvidencePatch = {
    evidenceKind: resolveEvidenceKind({ hasExtract, hasComputation }),
    computationCheckIds: hasComputation ? link.computationCheckIds : undefined,
    claimSpan: link.claimSpan,
  };
  if (link.matchedConsistent) {
    patch.support = "supported";
    patch.confidence = 0.85;
  }
  return patch;
}

/**
 * The agentic-RAG enforcement gate: an unsupported claim with NO supporting
 * extract AND no computational backing must be revised (written as a hypothesis
 * or removed), not merely scored into the Evidence Limits section.
 */
export function enforceUnsupportedClaim(check: {
  support: string;
  extractKeys?: string[];
  computationCheckIds?: string[];
}): boolean {
  return (
    check.support === "unsupported" &&
    (check.extractKeys?.length ?? 0) === 0 &&
    (check.computationCheckIds?.length ?? 0) === 0
  );
}

/** Verifier batch concurrency per tier — mirrors roundCapForAgent (Pro=4/Lite=2). */
export function auditConcurrencyForAgent(agentKind: "lite" | "pro" | undefined): number {
  return (agentKind ?? "pro") === "pro" ? 4 : 2;
}

/**
 * Run `fn` over `items` with at most `limit` in flight, preserving input order
 * in the result array. The caller's `fn` owns its own error handling (the
 * auditor wraps each claim in try/catch so a single failure never throws the
 * batch); this helper does not swallow rejections.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  const width = Math.max(1, Math.min(limit, items.length));
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: width }, () => worker()));
  return results;
}
