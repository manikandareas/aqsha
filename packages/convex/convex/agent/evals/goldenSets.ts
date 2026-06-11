// Typed parsers + label unions for the Phase 3 golden-set evals (Slice 3.3).
//
// Lives under convex/ (gate-covered) like scoring.ts. The labeled fixture DATA
// lives under tests/fixtures/golden-sets/*.json (the eval *.test.ts files import
// the JSON and feed it through these parsers) — keeping this module free of any
// cross-scope file import while still owning the label unions + validation so a
// fixture and its classifier can never silently drift.

import type { ComputationOutcome } from "../sandbox/computationOutcome";
import type { StatcheckRawRow } from "../sandbox/statcheckClassify";
import type { IntegrityStatus } from "../research/citationIntegrity";
import type { IntegritySignals } from "../research/citationIntegrity";

// The label sets passed to classMetrics — the single source of truth shared by
// the classifier and its golden set.
export const STAT_VERDICT_LABELS: ComputationOutcome[] = [
  "consistent",
  "discrepant",
  "decision_error",
  "not_computable",
];

export const INTEGRITY_LABELS: IntegrityStatus[] = [
  "verified",
  "metadata_mismatch",
  "identifier_invalid",
  "not_found",
  "unverifiable",
];

export interface StatGoldenRow {
  row: StatcheckRawRow;
  expected: ComputationOutcome;
  note?: string;
}

export interface CitationGoldenRow {
  signals: IntegritySignals;
  expected: IntegrityStatus;
  note?: string;
}

export interface IntentGoldenRow {
  prompt: string;
  /** Expected detectStatVerificationIntent result. */
  stat: boolean;
  /** Expected detectCitationVerifyIntent result. */
  citation: boolean;
  note?: string;
}

export interface SkillTriggerGoldenRow {
  prompt: string;
  /** The builtin skill name (e.g. "stat-verification"). */
  skill: string;
  /** Whether the skill SHOULD fire on this prompt. */
  relevant: boolean;
  note?: string;
}

function asArray(raw: unknown, label: string): unknown[] {
  if (!Array.isArray(raw)) throw new Error(`${label}: fixture must be a JSON array`);
  return raw;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}: each fixture row must be an object`);
  }
  return value as Record<string, unknown>;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label}: expected a boolean`);
  return value;
}

function requireLabel<T extends string>(value: unknown, labels: T[], label: string): T {
  if (typeof value !== "string" || !labels.includes(value as T)) {
    throw new Error(`${label}: "${String(value)}" is not one of ${labels.join(", ")}`);
  }
  return value as T;
}

/** Parse + validate the statcheck-verdict golden set. */
export function parseStatGolden(raw: unknown): StatGoldenRow[] {
  return asArray(raw, "statGolden").map((entry, i) => {
    const o = asRecord(entry, `statGolden[${i}]`);
    const row: StatcheckRawRow = {
      reportedComparison: typeof o.reportedComparison === "string" ? o.reportedComparison : "=",
      reportedPValue: numberOrNull(o.reportedPValue),
      computedPValue: numberOrNull(o.computedPValue),
      statistic: optionalString(o.statistic),
      df1: optionalNumber(o.df1),
      df2: optionalNumber(o.df2),
      testValue: optionalNumber(o.testValue),
      raw: optionalString(o.raw),
    };
    return {
      row,
      expected: requireLabel(o.expected, STAT_VERDICT_LABELS, `statGolden[${i}].expected`),
      note: optionalString(o.note),
    };
  });
}

/** Parse + validate the citation-integrity golden set. */
export function parseCitationGolden(raw: unknown): CitationGoldenRow[] {
  return asArray(raw, "citationGolden").map((entry, i) => {
    const o = asRecord(entry, `citationGolden[${i}]`);
    const signals: IntegritySignals = {
      hasIdentifier: o.hasIdentifier === true,
      identifierResolved: typeof o.identifierResolved === "boolean" ? o.identifierResolved : null,
      identifierTitleMatch:
        typeof o.identifierTitleMatch === "boolean" ? o.identifierTitleMatch : null,
      existenceFound: typeof o.existenceFound === "boolean" ? o.existenceFound : null,
      metadataConsistent: typeof o.metadataConsistent === "boolean" ? o.metadataConsistent : null,
      metadataIssues: Array.isArray(o.metadataIssues)
        ? o.metadataIssues.filter((x): x is string => typeof x === "string")
        : [],
    };
    return {
      signals,
      expected: requireLabel(o.expected, INTEGRITY_LABELS, `citationGolden[${i}].expected`),
      note: optionalString(o.note),
    };
  });
}

/** Parse + validate the routing intent corpus (labels for both detectors). */
export function parseIntentGolden(raw: unknown): IntentGoldenRow[] {
  return asArray(raw, "intentGolden").map((entry, i) => {
    const o = asRecord(entry, `intentGolden[${i}]`);
    if (typeof o.prompt !== "string") throw new Error(`intentGolden[${i}].prompt must be a string`);
    return {
      prompt: o.prompt,
      stat: requireBoolean(o.stat, `intentGolden[${i}].stat`),
      citation: requireBoolean(o.citation, `intentGolden[${i}].citation`),
      note: optionalString(o.note),
    };
  });
}

/** Parse + validate the skill-trigger relevance matrix. */
export function parseSkillTriggerGolden(raw: unknown): SkillTriggerGoldenRow[] {
  return asArray(raw, "skillTriggerGolden").map((entry, i) => {
    const o = asRecord(entry, `skillTriggerGolden[${i}]`);
    if (typeof o.prompt !== "string") {
      throw new Error(`skillTriggerGolden[${i}].prompt must be a string`);
    }
    if (typeof o.skill !== "string") {
      throw new Error(`skillTriggerGolden[${i}].skill must be a string`);
    }
    return {
      prompt: o.prompt,
      skill: o.skill,
      relevant: requireBoolean(o.relevant, `skillTriggerGolden[${i}].relevant`),
      note: optionalString(o.note),
    };
  });
}
