import { describe, expect, it } from "vitest";
import {
  aggregateRunCost,
  type RunLedgerRow,
} from "../convex/billing/reconciliation";

// AUD-12: aggregate the per-event provider ledger of one run into a single cost
// summary so the flat up-front charge can be reconciled against actual cost.

describe("aggregateRunCost", () => {
  it("sums credits, modeled cost, and tokens across a run's events", () => {
    const rows: RunLedgerRow[] = [
      { feature: "deep_research", credits: 120, estimatedCostCents: 18, inputTokens: 4000, outputTokens: 1200, totalTokens: 5200 },
      { feature: "external_search", credits: 0, estimatedCostCents: 2, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      { feature: "external_search", credits: 0, estimatedCostCents: 3 },
      { feature: "sandbox_compute", credits: 10, estimatedCostCents: 5, totalTokens: 0 },
    ];
    const agg = aggregateRunCost(rows);
    expect(agg.eventCount).toBe(4);
    expect(agg.creditsCharged).toBe(130);
    expect(agg.actualCostCents).toBe(28);
    expect(agg.inputTokens).toBe(4000);
    expect(agg.outputTokens).toBe(1200);
    expect(agg.totalTokens).toBe(5200);
  });

  it("buckets cost per feature", () => {
    const agg = aggregateRunCost([
      { feature: "deep_research", credits: 120, estimatedCostCents: 18 },
      { feature: "external_search", credits: 0, estimatedCostCents: 2 },
      { feature: "external_search", credits: 0, estimatedCostCents: 3 },
    ]);
    expect(agg.byFeature.deep_research).toEqual({ events: 1, credits: 120, costCents: 18 });
    expect(agg.byFeature.external_search).toEqual({ events: 2, credits: 0, costCents: 5 });
  });

  it("returns a zeroed aggregate for a run with no ledger events", () => {
    expect(aggregateRunCost([])).toEqual({
      eventCount: 0,
      creditsCharged: 0,
      actualCostCents: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      byFeature: {},
    });
  });
});
