import { describe, expect, it } from "vitest";
import intentFixture from "./fixtures/golden-sets/intentCorpus.json";
import {
  detectStatVerificationIntent,
  routeCompute,
} from "../convex/agent/sandbox/computeRouter";
import { detectCitationVerifyIntent } from "../convex/agent/research/citationRouter";
import { binaryMetrics, formatMetricsMarkdown } from "../convex/agent/evals/scoring";
import { parseIntentGolden } from "../convex/agent/evals/goldenSets";
import { emitMetrics } from "./evalEmit";

// Layer-A eval (Slice 3.3): corpus-driven precision/recall for the deterministic
// routing detectors, extending the spot tests in computeRouter/citationRouter
// with a labeled fires/silent corpus (incl. cross-talk + target-without-action).

describe("routing intent corpus", () => {
  const golden = parseIntentGolden(intentFixture);

  const statReport = binaryMetrics(
    golden.map((g) => detectStatVerificationIntent(g.prompt)),
    golden.map((g) => g.stat),
  );
  const citationReport = binaryMetrics(
    golden.map((g) => detectCitationVerifyIntent(g.prompt)),
    golden.map((g) => g.citation),
  );

  it("has a balanced corpus of 30+ labeled prompts", () => {
    expect(golden.length).toBeGreaterThanOrEqual(30);
    expect(golden.some((g) => g.stat)).toBe(true);
    expect(golden.some((g) => g.citation)).toBe(true);
    expect(golden.some((g) => !g.stat && !g.citation)).toBe(true);
    emitMetrics(formatMetricsMarkdown("stat intent", statReport));
    emitMetrics(formatMetricsMarkdown("citation intent", citationReport));
  });

  it("detectStatVerificationIntent matches every label (zero false fires/misses)", () => {
    const wrong = golden
      .map((g) => ({ prompt: g.prompt, want: g.stat, got: detectStatVerificationIntent(g.prompt) }))
      .filter((x) => x.got !== x.want);
    expect(wrong).toEqual([]);
  });

  it("detectCitationVerifyIntent matches every label (zero false fires/misses)", () => {
    const wrong = golden
      .map((g) => ({ prompt: g.prompt, want: g.citation, got: detectCitationVerifyIntent(g.prompt) }))
      .filter((x) => x.got !== x.want);
    expect(wrong).toEqual([]);
  });

  it("clears precision + recall floors for both detectors", () => {
    for (const r of [statReport, citationReport]) {
      expect(r.precision).toBeGreaterThanOrEqual(0.9);
      expect(r.recall).toBeGreaterThanOrEqual(0.9);
    }
  });
});

describe("routeCompute tier-gating", () => {
  const statPrompt = "verifikasi statistik di paper ini";
  const neutralPrompt = "summarize the key findings";

  it("Lite withholds the sandbox tools even on a clear stat-verification intent", () => {
    expect(routeCompute({ prompt: statPrompt, agentKind: "lite" })).toEqual({
      exposeStatVerification: false,
      intent: null,
    });
  });

  it("Pro exposes verifyStatistics only when the intent fires", () => {
    expect(routeCompute({ prompt: statPrompt, agentKind: "pro" })).toEqual({
      exposeStatVerification: true,
      intent: "stat_verification",
    });
    expect(routeCompute({ prompt: neutralPrompt, agentKind: "pro" })).toEqual({
      exposeStatVerification: false,
      intent: null,
    });
  });
});
