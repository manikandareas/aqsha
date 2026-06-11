import { v } from "convex/values";

// Shared Agent-Card contracts for the decomposed deep-research workflow (Phase 3,
// Slice 3.1). Every subagent is an internalAction with a SMALL typed input
// (runId + scalars) and a SMALL return (status + counts) — all bulk data is
// persisted to tables and re-read by runId, so nothing large crosses a workflow
// step boundary (the 1 MB/step + 8 MB journal invariant). Pure module: validators
// + budget-envelope helpers, no Convex registrations.

// ── Per-subagent budget envelope (AUD-12 reconciliation basis) ────────────────

export interface SubagentBudget {
  tokens?: number;
  providerCalls?: number;
  sandboxMinutes?: number;
}

export interface BudgetEnvelopeV2 {
  version: 2;
  perSubagent: Record<string, SubagentBudget>;
  totals: SubagentBudget;
}

export function emptyBudgetEnvelope(): BudgetEnvelopeV2 {
  return { version: 2, perSubagent: {}, totals: {} };
}

function addBudget(a: SubagentBudget, b: SubagentBudget): SubagentBudget {
  const sum: SubagentBudget = {};
  const tokens = (a.tokens ?? 0) + (b.tokens ?? 0);
  const providerCalls = (a.providerCalls ?? 0) + (b.providerCalls ?? 0);
  const sandboxMinutes = (a.sandboxMinutes ?? 0) + (b.sandboxMinutes ?? 0);
  if (tokens) sum.tokens = tokens;
  if (providerCalls) sum.providerCalls = providerCalls;
  if (sandboxMinutes) sum.sandboxMinutes = sandboxMinutes;
  return sum;
}

// Tolerant parse: a missing, legacy-v1, or malformed budgetJson upgrades to an
// empty v2 envelope (never throws — budget accounting must not fail a run).
export function parseBudgetEnvelope(json?: string | null): BudgetEnvelopeV2 {
  if (!json) return emptyBudgetEnvelope();
  try {
    const parsed = JSON.parse(json) as Partial<BudgetEnvelopeV2> & Record<string, unknown>;
    if (parsed && parsed.version === 2 && typeof parsed.perSubagent === "object") {
      return {
        version: 2,
        perSubagent: { ...parsed.perSubagent },
        totals: { ...(parsed.totals ?? {}) },
      };
    }
  } catch {
    // fall through to empty envelope
  }
  return emptyBudgetEnvelope();
}

// Immutably fold one subagent's consumption into the envelope (per-subagent +
// totals). Sequential in the workflow (split timing), so no OCC contention.
export function addToBudget(
  env: BudgetEnvelopeV2,
  subagent: string,
  delta: SubagentBudget,
): BudgetEnvelopeV2 {
  return {
    version: 2,
    perSubagent: {
      ...env.perSubagent,
      [subagent]: addBudget(env.perSubagent[subagent] ?? {}, delta),
    },
    totals: addBudget(env.totals, delta),
  };
}

export function serializeBudgetEnvelope(env: BudgetEnvelopeV2): string {
  return JSON.stringify(env);
}

// ── Shared validators ─────────────────────────────────────────────────────────

export const agentKindValidator = v.union(v.literal("lite"), v.literal("pro"));

/** The minimal context every subagent step receives (no bulk payload). */
export const subagentBaseArgs = {
  runId: v.id("agentRuns"),
  ownerUserId: v.string(),
  threadId: v.string(),
  agentKind: v.optional(agentKindValidator),
} as const;

export const subagentBudgetValidator = v.object({
  tokens: v.optional(v.number()),
  providerCalls: v.optional(v.number()),
  sandboxMinutes: v.optional(v.number()),
});

// A non-fatal subagent (the verifiers) NEVER throws inside a workflow step — it
// returns one of these statuses, so a failure does not fail the whole workflow.
export const subagentStatusValidator = v.union(
  v.literal("ok"),
  v.literal("skipped"),
  v.literal("failed"),
  v.literal("not_configured"),
  v.literal("rate_limited"),
);

export type SubagentStatus =
  | "ok"
  | "skipped"
  | "failed"
  | "not_configured"
  | "rate_limited";
