import type { SourceCandidate } from "../sourceCandidates";
import type { ResearchExtract } from "../deepResearch";

// Cross-round state rehydration for the decomposed deep-research loop (Phase 3,
// Slice 3.1). The monolithic `researchLoop` accumulates its loop state in memory
// across rounds; once each round becomes a standalone `literatureRoundAgent`
// workflow step, that state no longer survives, so each round must reconstruct it
// at entry from persisted rows by runId. This module is PURE (no Convex ctx) so
// the reconstruction can be unit-tested for parity against the old in-memory
// accumulation (loopState.test.ts) — the load-bearing guard for the rewrite.
//
// What downstream actually reads from the old `acceptedByKey` map is only
// `.source` and the key set (quality/readAttempts are never read after the round
// that produced them), so rehydration reconstructs the source candidates + key
// sets, not the full AcceptedSource. `domainPenalties` is NOT persisted by the
// pre-rewrite loop — the rewrite adds it to the round-end stateJson snapshot
// (see ROUND_SNAPSHOT_*), which this module parses back.

// Mirrors the SufficiencyStatus union in deepResearch.ts (kept local to avoid a
// runtime dependency on that heavy module).
export type SufficiencyStatus =
  | "unknown"
  | "insufficient"
  | "partial"
  | "sufficient"
  | "budget_exhausted";

// The exact key the loop uses to dedupe extracts (must match deepResearch.ts so
// rehydration reproduces the same map).
export function extractMapKey(extract: Pick<ResearchExtract, "sourceKey" | "quote">): string {
  return `${extract.sourceKey}:${extract.quote.slice(0, 80)}`;
}

// The per-round accumulator snapshot persisted into researchRoundStates.stateJson
// at round end (a JSON string field — no schema change). Lets the next round
// recover the cross-round penalties + assessment that are otherwise in-memory.
export interface RoundSnapshot {
  domainPenalties: Record<string, number>;
  gapAssessment: string;
  sufficiencyStatus: SufficiencyStatus;
}

export function parseRoundSnapshot(stateJson: string | undefined | null): RoundSnapshot | null {
  if (!stateJson) return null;
  try {
    const parsed = JSON.parse(stateJson) as { accumulator?: Partial<RoundSnapshot> };
    const acc = parsed.accumulator;
    if (!acc || typeof acc !== "object") return null;
    return {
      domainPenalties:
        acc.domainPenalties && typeof acc.domainPenalties === "object"
          ? Object.fromEntries(
              Object.entries(acc.domainPenalties).filter(([, v]) => typeof v === "number"),
            )
          : {},
      gapAssessment: typeof acc.gapAssessment === "string" ? acc.gapAssessment : "",
      sufficiencyStatus: isSufficiency(acc.sufficiencyStatus) ? acc.sufficiencyStatus : "unknown",
    };
  } catch {
    return null;
  }
}

function isSufficiency(value: unknown): value is SufficiencyStatus {
  return (
    value === "unknown" ||
    value === "insufficient" ||
    value === "partial" ||
    value === "sufficient" ||
    value === "budget_exhausted"
  );
}

export interface RehydratedLoopState {
  /** Accepted source candidates (the only part of AcceptedSource read later). */
  acceptedSources: SourceCandidate[];
  acceptedKeys: Set<string>;
  extractsByKey: Map<string, ResearchExtract>;
  rejectedKeys: Set<string>;
  /**
   * Rejected source candidates (when the read-back supplies them). Round ≥2 query
   * planning reads their domains to bias expansion away from rejected hosts; with
   * only keys available (legacy), this is empty and that softer signal is skipped.
   */
  rejectedSources: SourceCandidate[];
  domainPenalties: Map<string, number>;
  gapAssessment: string;
  sufficiencyStatus: SufficiencyStatus;
}

/**
 * Reconstruct the cross-round loop accumulation from persisted rows for a run.
 * Pure: callers load the rows (researchSources usage=accepted/rejected,
 * researchExtracts, the latest researchRoundStates snapshot) and pass them in.
 */
export function rehydrateLoopState(input: {
  acceptedSources: SourceCandidate[];
  rejectedKeys: string[];
  /** Full rejected candidates, if the read-back supplies them (preferred). */
  rejectedSources?: SourceCandidate[];
  extracts: ResearchExtract[];
  snapshot: RoundSnapshot | null;
  initialGapAssessment: string;
}): RehydratedLoopState {
  const acceptedKeys = new Set(
    input.acceptedSources.map((source) => source.sourceKey).filter((k): k is string => Boolean(k)),
  );
  const extractsByKey = new Map<string, ResearchExtract>();
  for (const extract of input.extracts) {
    extractsByKey.set(extractMapKey(extract), extract);
  }
  const rejectedSources = input.rejectedSources ?? [];
  // Prefer keys derived from full sources; fall back to the supplied key list.
  const rejectedKeys = rejectedSources.length
    ? new Set(rejectedSources.map((source) => source.sourceKey).filter((k): k is string => Boolean(k)))
    : new Set(input.rejectedKeys);
  return {
    acceptedSources: input.acceptedSources,
    acceptedKeys,
    extractsByKey,
    rejectedKeys,
    rejectedSources,
    domainPenalties: new Map(Object.entries(input.snapshot?.domainPenalties ?? {})),
    gapAssessment: input.snapshot?.gapAssessment || input.initialGapAssessment,
    sufficiencyStatus: input.snapshot?.sufficiencyStatus ?? "unknown",
  };
}
