import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

// AUD-12: per-run billing reconciliation. Deep/sandbox runs are charged a FLAT
// credit amount up front (good UX), but the actual cost (provider tokens +
// per-call cost + sandbox) is recorded per event in providerUsageLedger with the
// run's id. This module aggregates those events per run so flat rates can be
// calibrated against real cost. The aggregator is pure → unit-testable.

const LEDGER_SCAN_LIMIT = 512;

export interface RunLedgerRow {
  feature: string;
  credits: number;
  estimatedCostCents: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface RunCostAggregate {
  eventCount: number;
  /** Credits actually charged across the run's events (the flat charges). */
  creditsCharged: number;
  /** Modeled provider cost in cents (token + per-call), the reconciliation basis. */
  actualCostCents: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  byFeature: Record<
    string,
    { events: number; credits: number; costCents: number }
  >;
}

export function aggregateRunCost(rows: RunLedgerRow[]): RunCostAggregate {
  const agg: RunCostAggregate = {
    eventCount: 0,
    creditsCharged: 0,
    actualCostCents: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    byFeature: {},
  };
  for (const row of rows) {
    agg.eventCount += 1;
    agg.creditsCharged += row.credits;
    agg.actualCostCents += row.estimatedCostCents;
    agg.inputTokens += row.inputTokens ?? 0;
    agg.outputTokens += row.outputTokens ?? 0;
    agg.totalTokens += row.totalTokens ?? 0;
    const bucket =
      agg.byFeature[row.feature] ??
      (agg.byFeature[row.feature] = { events: 0, credits: 0, costCents: 0 });
    bucket.events += 1;
    bucket.credits += row.credits;
    bucket.costCents += row.estimatedCostCents;
  }
  return agg;
}

// Aggregate the actual provider cost attributed to a single agent run, for
// reconciliation against the flat credits charged. Owner-scoped + index-bounded.
export const reconcileRunCost = internalQuery({
  args: { ownerUserId: v.string(), runId: v.id("agentRuns") },
  handler: async (ctx, args): Promise<RunCostAggregate> => {
    const rows = await ctx.db
      .query("providerUsageLedger")
      .withIndex("by_owner_run", (q) =>
        q.eq("ownerUserId", args.ownerUserId).eq("runId", args.runId),
      )
      .take(LEDGER_SCAN_LIMIT);
    return aggregateRunCost(rows);
  },
});
