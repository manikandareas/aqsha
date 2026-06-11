import { describe, expect, it } from "vitest";
import {
  addToBudget,
  emptyBudgetEnvelope,
  parseBudgetEnvelope,
  serializeBudgetEnvelope,
} from "../convex/agent/research/subagents/contracts";

// Slice 3.1: the per-subagent budget envelope (AUD-12 reconciliation basis).

describe("budget envelope", () => {
  it("starts empty", () => {
    expect(emptyBudgetEnvelope()).toEqual({ version: 2, perSubagent: {}, totals: {} });
  });

  it("tolerates missing / malformed / legacy budgetJson -> empty v2", () => {
    expect(parseBudgetEnvelope(undefined)).toEqual(emptyBudgetEnvelope());
    expect(parseBudgetEnvelope(null)).toEqual(emptyBudgetEnvelope());
    expect(parseBudgetEnvelope("not json")).toEqual(emptyBudgetEnvelope());
    // legacy v1 shape { maxRounds, model, ... } upgrades to an empty v2 envelope
    expect(parseBudgetEnvelope(JSON.stringify({ maxRounds: 4, model: "gpt-5.5" }))).toEqual(
      emptyBudgetEnvelope(),
    );
  });

  it("accumulates per-subagent consumption and totals", () => {
    let env = emptyBudgetEnvelope();
    env = addToBudget(env, "literatureRound", { tokens: 1000, providerCalls: 3 });
    env = addToBudget(env, "literatureRound", { tokens: 500, providerCalls: 2 });
    env = addToBudget(env, "statistical", { sandboxMinutes: 2, tokens: 200 });

    expect(env.perSubagent.literatureRound).toEqual({ tokens: 1500, providerCalls: 5 });
    expect(env.perSubagent.statistical).toEqual({ tokens: 200, sandboxMinutes: 2 });
    expect(env.totals).toEqual({ tokens: 1700, providerCalls: 5, sandboxMinutes: 2 });
  });

  it("round-trips through serialize/parse", () => {
    const env = addToBudget(emptyBudgetEnvelope(), "writer", { tokens: 42 });
    expect(parseBudgetEnvelope(serializeBudgetEnvelope(env))).toEqual(env);
  });

  it("does not mutate the input envelope (immutable update)", () => {
    const base = emptyBudgetEnvelope();
    const next = addToBudget(base, "audit", { tokens: 10 });
    expect(base).toEqual({ version: 2, perSubagent: {}, totals: {} });
    expect(next.totals.tokens).toBe(10);
  });
});
